import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { Role } from 'src/common/enum/role.enum';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Doctor, DoctorDocument } from '../doctors/schemas/doctor.schema';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
  ) {}

  async register(data: {
    name: string;
    email: string;
    password: string;
    role: Role;
    doctorId?: string;
  }) {
    const user = await this.usersService.createUser(data);
    const tokens = await this.generateToken(
      user._id.toString(),
      user.role,
      user.email,
    );
    await this.usersService.updateRefreshToken(
      user._id.toString(),
      tokens.refreshToken,
    );
    return tokens;
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (user.status === 'BLOCKED') {
      throw new UnauthorizedException('Account blocked');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Email not verified. Please verify your email first.',
      );
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.generateToken(
      user._id.toString(),
      user.role,
      user.email,
    );
    await this.usersService.updateRefreshToken(
      user._id.toString(),
      tokens.refreshToken,
    );
    return tokens;
  }

  async resendRegistrationOtp(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.isEmailVerified) {
      throw new UnauthorizedException('Email already verified');
    }

    const otp = this.generateOtp();
    const hashedOtp = await bcrypt.hash(otp, 12);
    const expirationMinutes = parseInt(
      this.config.get<string>('OTP_EXPIRATION_MINUTES') || '15',
    );
    const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

    await this.usersService.saveEmailVerificationOtp(
      email,
      hashedOtp,
      expiresAt,
    );

    // Send OTP via email
    await this.mailService.sendEmailVerificationOtp(email, otp);

    return {
      message: 'OTP resent to your email',
      otp: process.env.NODE_ENV === 'development' ? otp : undefined,
    };
  }

  async logout(userId: string) {
    await this.usersService.updateRefreshToken(userId, null);
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.refreshToken) {
      throw new ForbiddenException('Access Denied');
    }

    const refreshTokenMatches = await bcrypt.compare(
      refreshToken,
      user.refreshToken,
    );
    if (!refreshTokenMatches) throw new ForbiddenException('Access Denied');

    const tokens = await this.generateToken(
      user._id.toString(),
      user.role,
      user.email,
    );
    await this.usersService.updateRefreshToken(
      user._id.toString(),
      tokens.refreshToken,
    );
    return tokens;
  }

  private async generateToken(userId: string, role: string, email: string) {
    let doctorId: string | null = null;

    if (role === Role.DOCTOR) {
      const doctor = await this.doctorModel.findOne({ userId });
      if (doctor) {
        doctorId = doctor._id.toString();
      }
    }

    const payload: any = {
      userId,
      role,
      email,
    };

    if (doctorId) {
      payload.doctorId = doctorId;
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACC_EXPIRATION') as any,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REF_EXPIRATION') as any,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async sendRegistrationOtp(data: {
    name: string;
    email: string;
    password: string;
    role: Role;
    doctorId?: string;
  }) {
    // Check if user already exists and is verified
    const existingUser = await this.usersService.findByEmail(data.email);
    if (existingUser && existingUser.isEmailVerified) {
      throw new UnauthorizedException('Email already registered');
    }

    // Generate OTP
    const otp = this.generateOtp();
    const hashedOtp = await bcrypt.hash(otp, 12);
    const expirationMinutes = parseInt(
      this.config.get<string>('OTP_EXPIRATION_MINUTES') || '15',
    );
    const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

    // Create or update pending registration with hashed password
    const hashedPassword = await bcrypt.hash(data.password, 12);
    await this.usersService.userModel.findOneAndUpdate(
      { email: data.email },
      {
        email: data.email,
        name: data.name,
        password: hashedPassword,
        role: data.role,
        doctorId: data.doctorId,
        emailVerificationOtp: hashedOtp,
        emailVerificationOtpExpires: expiresAt,
        isEmailVerified: false,
      },
      { upsert: true },
    );

    // Send OTP via email
    await this.mailService.sendEmailVerificationOtp(data.email, otp);

    return {
      message: 'OTP sent to your email',
      otp: process.env.NODE_ENV === 'development' ? otp : undefined,
    };
  }

  async verifyRegistrationOtp(email: string, otp: string) {
    const isValid = await this.usersService.verifyEmailVerificationOtp(
      email,
      otp,
    );
    if (!isValid) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // Get the verified user
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Generate tokens
    const tokens = await this.generateToken(
      user._id.toString(),
      user.role,
      user.email,
    );
    await this.usersService.updateRefreshToken(
      user._id.toString(),
      tokens.refreshToken,
    );

    return tokens;
  }

  async sendPasswordResetOtp(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // Don't reveal if email exists or not for security
      return { message: 'If email exists, OTP has been sent' };
    }

    const otp = this.generateOtp();
    const hashedOtp = await bcrypt.hash(otp, 12);
    const expirationMinutes = parseInt(
      this.config.get<string>('OTP_EXPIRATION_MINUTES') || '15',
    );
    const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

    await this.usersService.savePasswordResetOtp(email, hashedOtp, expiresAt);

    // Send OTP via email
    await this.mailService.sendResetPasswordOtp(email, otp);

    return {
      message: 'If email exists, OTP has been sent',
      otp: process.env.NODE_ENV === 'development' ? otp : undefined,
    };
  }

  async resetPassword(email: string, otp: string, newPassword: string) {
    const isValid = await this.usersService.verifyPasswordResetOtp(email, otp);
    if (!isValid) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    await this.usersService.updatePassword(email, newPassword);
    return { message: 'Password reset successfully' };
  }
}
