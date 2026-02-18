import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export type DoctorDocument = Doctor & Document;

@Schema({ timestamps: true })
export class Doctor {
  @Prop({ type: Types.ObjectId, ref: 'User', unique: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  currentOrganization: string;

  @Prop({ type: Types.ObjectId, ref: 'Specialist', required: true })
  specialtyId: Types.ObjectId;

  @Prop()
  experienceYears: number;

  @Prop()
  about: string;

  @Prop()
  bankName?: string;

  @Prop()
  accountName?: string;

  @Prop()
  accountNumber?: string;

  @Prop({ type: [String], default: [] })
  verificationDocuments: string[];

  @Prop({
    type: String,
    enum: ['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'],
    default: 'PENDING',
  })
  verificationStatus: string;

  @Prop()
  verificationNote?: string;

  @Prop({ default: false })
  isVerified: boolean;

  // Paystack transfer recipient tracking
  @Prop()
  paystackRecipientCode?: string;

  @Prop()
  recipientCreatedAt?: Date;

  // Earnings tracking
  @Prop({ default: 0 })
  totalEarnings: number; // Lifetime earnings (100%)

  @Prop({ default: 0 })
  totalPayouts: number; // Total paid out (90%)

  @Prop({ default: 0 })
  pendingPayouts: number; // Awaiting payout
}

export const DoctorSchema = SchemaFactory.createForClass(Doctor);

// Performance indexes for common queries
DoctorSchema.index({ userId: 1 }); // CRITICAL: Used in all populate queries
DoctorSchema.index({ specialtyId: 1 }); // Filter by specialty (very common)
DoctorSchema.index({ verificationStatus: 1 }); // Admin filtering
DoctorSchema.index({ isVerified: 1 }); // Public listings
DoctorSchema.index({ specialtyId: 1, isVerified: 1 }); // Compound for public doctor listings
DoctorSchema.index({ userId: 1, verificationStatus: 1 }); // Admin user lookups
