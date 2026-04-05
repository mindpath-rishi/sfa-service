/**
 * Stock Count Items Collection
 * ------------------------------
 * Purpose : Store product-wise Stock stock per van per day
 * Used by : SALES / SUPERVISOR / BACK_OFFICE
 *
 * Contains:
 * - Stock count reference
 * - Product reference
 * - Stock quantity
 * - Weight & value snapshot
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StockCountItemDocument = HydratedDocument<StockCountItem>;

@Schema({ timestamps: true, collection: 'stock_count_items' })
export class StockCountItem {
  @Prop({ required: true, index: true, type: String })
  stockCountId: string;

  @Prop({ required: true, index: true, type: String })
  productId: string;

  @Prop({ type: Number, required: true })
  stock: number;

  @Prop({ type: Number, required: true })
  weight: number;

  @Prop({ type: Number, required: true })
  value: number;

  @Prop({ type: Number, required: true })
  price: number;
}

export const StockCountItemSchema =
  SchemaFactory.createForClass(StockCountItem);

StockCountItemSchema.index({ stockCountId: 1, productId: 1 }, { unique: true });
