import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Role } from 'src/common/enum/role.enum';
import { UserStatus } from 'src/common/enum/user.status.enum';
import { BloodGroup } from 'src/common/enum/blood-group.enum';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, enum: Role })
  role: Role;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop()
  phone: string;

  @Prop({ required: true })
  password: string;

  @Prop({ unique: true, sparse: true })
  doctorId?: string;

  @Prop()
  refreshToken?: string;

  @Prop({ default: UserStatus.ACTIVE, enum: UserStatus })
  status: string;

  @Prop()
  emailVerificationOtp?: string;

  @Prop()
  emailVerificationOtpExpires?: Date;

  @Prop()
  passwordResetOtp?: string;

  @Prop()
  passwordResetOtpExpires?: Date;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop()
  dateOfBirth?: Date;

  @Prop()
  profileImage?: string;

  @Prop({ type: [String], default: [] })
  fcmTokens: string[];

  @Prop({ type: [String], default: [] })
  allergies: string[];

  @Prop({ enum: BloodGroup })
  bloodGroup?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ email: 1 }, { unique: true });
