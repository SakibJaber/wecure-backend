import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';
import { DayOfWeek } from 'src/common/enum/days.enum';

export type AvailabilityDocument = DoctorAvailability & Document;

@Schema({
  timestamps: true,
})
export class DoctorAvailability {
  @Prop({ type: Types.ObjectId, ref: 'Doctor', required: true, index: true })
  doctorId: Types.ObjectId;

  @Prop({
    required: true,
    enum: DayOfWeek,
  })
  dayOfWeek: DayOfWeek;

  @Prop({ required: true, min: 5 })
  slotSizeMinutes: number;

  @Prop({ required: true })
  startTime: string; // HH:mm

  @Prop({ required: true })
  endTime: string; // HH:mm

  @Prop({ default: true })
  isActive: boolean;
}

export const DoctorAvailabilitySchema =
  SchemaFactory.createForClass(DoctorAvailability);

DoctorAvailabilitySchema.index({ doctorId: 1, dayOfWeek: 1 }, { unique: true });
