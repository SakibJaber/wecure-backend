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
    private readonly userModel: Model<UserDocument>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async createUser(data: {
    name: string;
    email: string;
    password: string;
    role: string;
    phone?: string;
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
}
