import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export type AppointmentDocument = Appointment & Document;

@Schema({
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Appointment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Doctor', required: true, index: true })
  doctorId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Specialist', required: true })
  specialistId: Types.ObjectId;

  @Prop({ required: true, index: true })
  appointmentDate: Date;

  @Prop({ required: true })
  appointmentTime: string; // HH:mm

  @Prop({ required: true })
  appointmentEndTime: string; // HH:mm

  @Prop()
  reasonTitle?: string;

  @Prop()
  reasonDetails?: string;

  @Prop({
    enum: ['UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'],
    default: 'UPCOMING',
    index: true,
  })
  status: string;

  @Prop({ required: true })
  consultationFee: number;

  @Prop({ type: Types.ObjectId, ref: 'Payment' })
  paymentId?: Types.ObjectId;
}

export const AppointmentSchema = SchemaFactory.createForClass(Appointment);

AppointmentSchema.index(
  { doctorId: 1, appointmentDate: 1, appointmentTime: 1 },
  { unique: true },
);
AppointmentSchema.index({ userId: 1, appointmentDate: -1 });
AppointmentSchema.index({ doctorId: 1, appointmentDate: -1 });

AppointmentSchema.virtual('attachments', {
  ref: 'AppointmentAttachment',
  localField: '_id',
  foreignField: 'appointmentId',
});
