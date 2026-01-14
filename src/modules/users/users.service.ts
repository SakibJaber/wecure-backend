import { Injectable, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './schemas/user.schema';
import { EncryptionService } from 'src/common/services/encryption.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    public readonly userModel: Model<UserDocument>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async createUser(data: {
    name: string;
    email: string;
    password: string;
    role: string;
    phone?: string;
    doctorId?: string;
  }) {
    const exists = await this.userModel.findOne({ email: data.email });
    if (exists) throw new ConflictException('Email already in use');

    const hashedPassword = await bcrypt.hash(data.password, 12);

    if (data.phone) {
      data.phone = this.encryptionService.encrypt(data.phone);
    }

    return this.userModel.create({
      ...data,
      password: hashedPassword,
    });
  }

  async findByEmail(email: string) {
    const user = await this.userModel.findOne({ email }).lean();
    if (user && user.phone) {
      user.phone = this.encryptionService.decrypt(user.phone);
    }
    return user;
  }

  async findById(id: string) {
    const user = await this.userModel.findById(id).select('-password').lean();
    if (user && user.phone) {
      user.phone = this.encryptionService.decrypt(user.phone);
    }
    return user;
  }

  async updateRefreshToken(userId: string, refreshToken: string | null) {
    const hashedRefreshToken = refreshToken
      ? await bcrypt.hash(refreshToken, 12)
      : null;
    await this.userModel.findByIdAndUpdate(userId, {
      refreshToken: hashedRefreshToken,
    });
  }

  async saveEmailVerificationOtp(
    email: string,
    hashedOtp: string,
    expiresAt: Date,
  ) {
    await this.userModel.findOneAndUpdate(
      { email },
      {
        emailVerificationOtp: hashedOtp,
        emailVerificationOtpExpires: expiresAt,
      },
      { upsert: true },
    );
  }

  async verifyEmailVerificationOtp(
    email: string,
    otp: string,
  ): Promise<boolean> {
    const user = await this.userModel.findOne({ email });
    if (
      !user ||
      !user.emailVerificationOtp ||
      !user.emailVerificationOtpExpires
    ) {
      return false;
    }

    if (new Date() > user.emailVerificationOtpExpires) {
      return false;
    }

    const isValid = await bcrypt.compare(otp, user.emailVerificationOtp);
    if (isValid) {
      await this.userModel.findOneAndUpdate(
        { email },
        {
          isEmailVerified: true,
          emailVerificationOtp: null,
          emailVerificationOtpExpires: null,
        },
      );
    }
    return isValid;
  }

  async savePasswordResetOtp(
    email: string,
    hashedOtp: string,
    expiresAt: Date,
  ) {
    await this.userModel.findOneAndUpdate(
      { email },
      {
        passwordResetOtp: hashedOtp,
        passwordResetOtpExpires: expiresAt,
      },
    );
  }

  async verifyPasswordResetOtp(email: string, otp: string): Promise<boolean> {
    const user = await this.userModel.findOne({ email });
    if (!user || !user.passwordResetOtp || !user.passwordResetOtpExpires) {
      return false;
    }

    if (new Date() > user.passwordResetOtpExpires) {
      return false;
    }

    const isValid = await bcrypt.compare(otp, user.passwordResetOtp);
    if (isValid) {
      await this.userModel.findOneAndUpdate(
        { email },
        {
          passwordResetOtp: null,
          passwordResetOtpExpires: null,
        },
      );
    }
    return isValid;
  }

  async updatePassword(email: string, newPassword: string) {
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await this.userModel.findOneAndUpdate(
      { email },
      {
        password: hashedPassword,
        passwordResetOtp: null,
        passwordResetOtpExpires: null,
      },
    );
  }

  async getPendingRegistration(email: string) {
    return this.userModel
      .findOne({
        email,
        isEmailVerified: false,
      })
      .lean();
  }

  async updateProfile(
    userId: string,
    data: {
      name?: string;
      phone?: string;
      dateOfBirth?: string;
      profileImage?: string;
    },
  ) {
    const updates: any = {};
    if (data.name) updates.name = data.name;
    if (data.dateOfBirth) updates.dateOfBirth = new Date(data.dateOfBirth);
    if (data.profileImage) updates.profileImage = data.profileImage;
    if (data.phone) {
      updates.phone = this.encryptionService.encrypt(data.phone);
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(userId, updates, { new: true })
      .select('-password')
      .lean();

    if (updatedUser && updatedUser.phone) {
      updatedUser.phone = this.encryptionService.decrypt(updatedUser.phone);
    }

    return updatedUser;
  }

  async changePassword(userId: string, data: any) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new ConflictException('User not found');
    }

    const match = await bcrypt.compare(data.oldPassword, user.password);
    if (!match) {
      throw new ConflictException('Invalid old password');
    }

    const hashedPassword = await bcrypt.hash(data.newPassword, 12);
    await this.userModel.findByIdAndUpdate(userId, {
      password: hashedPassword,
    });
  }

  async deleteAccount(userId: string) {
    await this.userModel.findByIdAndDelete(userId);
  }

  async findAll(query: any) {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (query.role) filter.role = query.role;
    if (query.search) {
      filter.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { email: { $regex: query.search, $options: 'i' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.userModel
        .find(filter)
        .skip(skip)
        .limit(limit)
        .select('-password')
        .lean(),
      this.userModel.countDocuments(filter),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async toggleUserStatus(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new ConflictException('User not found');
    }

    const newStatus = user.status === 'BLOCKED' ? 'ACTIVE' : 'BLOCKED';
    return this.userModel.findByIdAndUpdate(
      userId,
      { status: newStatus },
      { new: true },
    );
  }

  async changeRole(userId: string, role: string) {
    return this.userModel.findByIdAndUpdate(userId, { role }, { new: true });
  }
}
