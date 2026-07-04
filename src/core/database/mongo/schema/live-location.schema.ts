import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LiveLocationDocument = HydratedDocument<LiveLocation>;

@Schema({ _id: false })
export class LiveLocationPoint {
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

export const LiveLocationPointSchema =
  SchemaFactory.createForClass(LiveLocationPoint);

@Schema({ timestamps: true, collection: 'live_location_tracking' })
export class LiveLocation {
  @Prop({ required: true, unique: true, type: String })
  locationId!: string;

  @Prop({ required: true, type: String })
  userId!: string;

  @Prop({ required: true, type: String })
  workSessionId!: string;

  @Prop({ required: true, type: String })
  vanId!: string;

  /** UTC start-of-day used as the daily aggregate key. */
  @Prop({ required: true, type: Date })
  date!: Date;

  @Prop({ type: [LiveLocationPointSchema], default: [] })
  locations!: LiveLocationPoint[];
}

export const LiveLocationSchema = SchemaFactory.createForClass(LiveLocation);

LiveLocationSchema.index(
  { workSessionId: 1, vanId: 1, date: 1 },
  {
    unique: true,
    // Existing installations can still contain the previous point-per-document
    // records, which have no `date`. Excluding them keeps rollout/index creation safe.
    partialFilterExpression: { date: { $type: 'date' } },
  },
);
LiveLocationSchema.index({ userId: 1, date: -1 });
