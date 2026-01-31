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
}

export const DoctorSchema = SchemaFactory.createForClass(Doctor);

DoctorSchema.index({ userId: 1 }, { unique: true });
