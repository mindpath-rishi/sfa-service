import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FocusedPackTargetDocument = HydratedDocument<FocusedPackTarget>;

@Schema({ collection: 'focused_pack_targets', timestamps: true })
export class FocusedPackTarget {
  @Prop({ required: true, type: String, index: true })
  userId!: string;

  @Prop({ type: String })
  userName?: string;

  @Prop({ required: true, type: String, index: true })
  productId!: string;

  @Prop({ required: true, type: String })
  productName!: string;

  @Prop({ type: Number, default: 0, min: 0 })
  targetCases!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  targetTonnage!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  targetValue!: number;

  @Prop({ required: true, type: Date, index: true })
  startDate!: Date;

  @Prop({ required: true, type: Date, index: true })
  endDate!: Date;
}

export const FocusedPackTargetSchema =
  SchemaFactory.createForClass(FocusedPackTarget);

FocusedPackTargetSchema.index(
  { userId: 1, productId: 1, startDate: 1, endDate: 1 },
  { unique: true, name: 'unique_user_focused_pack_product_period' },
);
