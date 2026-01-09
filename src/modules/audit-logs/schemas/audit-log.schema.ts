import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  action: string;

  @Prop({ required: true })
  resource: string;

  @Prop()
  resourceId: string;

  @Prop()
  ipAddress: string;
}

export const AuditLogSchema =
  SchemaFactory.createForClass(AuditLog);
