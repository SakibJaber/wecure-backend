import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WellnessTipDocument = WellnessTip & Document;

@Schema({ timestamps: true })
export class WellnessTip {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  content: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  publishedAt: Date;
}

export const WellnessTipSchema =
  SchemaFactory.createForClass(WellnessTip);

WellnessTipSchema.index({ title: 1 }, { unique: true });