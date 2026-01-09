import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export type AppointmentDocument = Appointment & Document;

@Schema({ timestamps: true })
export class Appointment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Doctor', required: true })
  doctorId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Specialist', required: true })
  specialistId: Types.ObjectId;

  @Prop({ required: true })
  appointmentDate: Date;

  @Prop({ required: true })
  appointmentTime: string; // HH:mm

  @Prop()
  reasonTitle: string;

  @Prop()
  reasonDetails: string;

  @Prop({
    enum: ['UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'],
    default: 'UPCOMING',
  })
  status: string;

  @Prop({ required: true })
  fee: number;
}

export const AppointmentSchema =
  SchemaFactory.createForClass(Appointment);
