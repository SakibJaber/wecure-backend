import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export type AvailabilityDocument = DoctorAvailability & Document;

@Schema()
export class DoctorAvailability {
  @Prop({ type: Types.ObjectId, ref: 'Doctor', required: true })
  doctorId: Types.ObjectId;

  @Prop({ required: true })
  dayOfWeek: string; // Monday–Sunday

  @Prop({ required: true })
  slotSizeMinutes: number;

  @Prop({ required: true })
  startTime: string; // HH:mm

  @Prop({ required: true })
  endTime: string; // HH:mm
}

export const DoctorAvailabilitySchema =
  SchemaFactory.createForClass(DoctorAvailability);
