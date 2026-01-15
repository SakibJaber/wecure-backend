import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export type ContactSupportDocument = ContactSupport & Document;

export enum ContactSupportStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
}

@Schema({ timestamps: true })
export class ContactSupport {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  message: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(ContactSupportStatus),
    default: ContactSupportStatus.PENDING,
  })
  status: ContactSupportStatus;

  @Prop()
  adminResponse: string;
}

export const ContactSupportSchema =
  SchemaFactory.createForClass(ContactSupport);
