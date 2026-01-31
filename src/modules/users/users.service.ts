import {
  Injectable,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './schemas/user.schema';
import { EncryptionService } from 'src/common/services/encryption.service';
import { Role } from 'src/common/enum/role.enum';
import { UserStatus } from 'src/common/enum/user.status.enum';
import { CreateAdminDto } from './dto/create-admin.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(
    @InjectModel(User.name)
    public readonly userModel: Model<UserDocument>,
    private readonly encryptionService: EncryptionService,
    private readonly eventEmitter: EventEmitter2,
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

    const dataToSave: any = {
      ...data,
      password: hashedPassword,
    };

    if (data.phone) {
      dataToSave.phone = this.encryptionService.encrypt(data.phone);
    }

    if (data.role === Role.ADMIN || data.role === Role.SUPER_ADMIN) {
      dataToSave.isEmailVerified = true;
    }

    const status =
      data.role === Role.DOCTOR ? UserStatus.PENDING : UserStatus.ACTIVE;

    return this.userModel.create({
      ...dataToSave,
      status,
    });
  }

  async createAdmin(data: CreateAdminDto) {
    const admin = await this.createUser({
      ...data,
      role: Role.ADMIN,
    });

    // Emit event to send credentials via email
    this.eventEmitter.emit('admin.created', {
      email: data.email,
      name: data.name,
      password: data.password, // Original password before hashing in createUser
    });

    return admin;
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
      ? await bcrypt.hash(refreshToken, 11)
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
      allergies?: string[];
      bloodGroup?: string;
    },
  ) {
    const updates: any = {};
    if (data.name) updates.name = data.name;
    if (data.dateOfBirth) updates.dateOfBirth = new Date(data.dateOfBirth);
    if (data.profileImage) updates.profileImage = data.profileImage;
    if (data.allergies) updates.allergies = data.allergies;
    if (data.bloodGroup) updates.bloodGroup = data.bloodGroup;
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

    const decryptedData = data.map((user) => {
      if (user.phone) {
        user.phone = this.encryptionService.decrypt(user.phone);
      }
      return user;
    });

    return {
      data: decryptedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async toggleUserStatus(userId: string, requestingUserId?: string) {
    if (requestingUserId && userId === requestingUserId) {
      throw new BadRequestException('You cannot block/unblock yourself');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new ConflictException('User not found');
    }

    const newStatus =
      user.status === UserStatus.BLOCKED
        ? UserStatus.ACTIVE
        : UserStatus.BLOCKED;
    return this.userModel.findByIdAndUpdate(
      userId,
      { status: newStatus },
      { new: true },
    );
  }

  async changeRole(userId: string, role: string) {
    return this.userModel.findByIdAndUpdate(userId, { role }, { new: true });
  }

  async registerFcmToken(userId: string, token: string) {
    return this.userModel.findByIdAndUpdate(
      userId,
      { $addToSet: { fcmTokens: token } },
      { new: true },
    );
  }

  async removeFcmToken(userId: string, token: string) {
    return this.userModel.findByIdAndUpdate(
      userId,
      { $pull: { fcmTokens: token } },
      { new: true },
    );
  }
}
