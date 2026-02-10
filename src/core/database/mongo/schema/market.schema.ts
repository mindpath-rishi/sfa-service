/**
 * Markets Collection
 * -----------------
 * Purpose : Market master classification
 * Used by : BACK_OFFICE / ADMIN / SALES
 *
 * Contains:
 * - Market identity
 * - Market name
 * - Market status
 *
 * Notes:
 * - Markets are used for customer segmentation
 * - Soft deletes preserve audit history
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MarketStatus } from 'src/shared/enums/market.enums';

export type MarketDocument = HydratedDocument<Market>;

@Schema({ timestamps: true })
export class Market {
  /* ======================================================
   * IDENTITY
   * ====================================================== */

  // Unique business identifier for market
  @Prop({ required: true, unique: true })
  marketId: string;

  // Display name of market
  @Prop({ required: true, unique: true, trim: true })
  name: string;

  /* ======================================================
   * STATUS
   * ====================================================== */

  // Market availability status
  @Prop({
    type: String,
    enum: MarketStatus,
    default: MarketStatus.ACTIVE,
  })
  status: MarketStatus;

}

export const MarketSchema = SchemaFactory.createForClass(Market);
