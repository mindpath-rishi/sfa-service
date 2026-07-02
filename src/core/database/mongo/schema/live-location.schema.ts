import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LiveLocationDocument = HydratedDocument<LiveLocation>;

@Schema({ timestamps: true, collection: 'live_location_tracking' })
export class LiveLocation {
  @Prop({ required: true, unique: true, type: String })
  locationId!: string;

  @Prop({ required: true, type: String })
  userId!: string;

  @Prop({ required: true, type: String })
  workSessionId!: string;

  @Prop({ type: String })
  vanId?: string;

  @Prop({ type: String, default: 'BACKGROUND' })
  source?: string;

  @Prop({ required: true, type: Number })
  latitude!: number;

  @Prop({ required: true, type: Number })
  longitude!: number;

  @Prop({ type: Number })
  accuracy?: number;

  @Prop({ type: Number })
  altitude?: number;

  @Prop({ type: Number })
  speed?: number;

  @Prop({ type: Number, min: 0, max: 360 })
  heading?: number;

  @Prop({ required: true, type: Date, default: Date.now })
  capturedAt!: Date;
}

export const LiveLocationSchema = SchemaFactory.createForClass(LiveLocation);

LiveLocationSchema.index({ userId: 1, capturedAt: -1 });
LiveLocationSchema.index({ workSessionId: 1, capturedAt: 1 });
LiveLocationSchema.index({ locationId: 1 }, { unique: true });
