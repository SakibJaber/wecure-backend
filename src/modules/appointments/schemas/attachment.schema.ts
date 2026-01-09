import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export type AttachmentDocument = AppointmentAttachment & Document;

@Schema({ timestamps: true })
export class AppointmentAttachment {
  @Prop({ type: Types.ObjectId, ref: 'Appointment', required: true })
  appointmentId: Types.ObjectId;

  @Prop({ required: true })
  fileUrl: string;

  @Prop()
  fileType: string;
}

export const AppointmentAttachmentSchema =
  SchemaFactory.createForClass(AppointmentAttachment);
