/**
 * Stock Sales Items Collection
 * ----------------------------
 * Purpose : Store product-wise reconciled sales data
 * Used by : BACK_OFFICE / ERP
 *
 * Contains:
 * - Sales reference
 * - Product reference
 * - System stock snapshot
 * - Stock movement
 * - Sales values
 * - Variance
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StockSalesItemDocument =
  HydratedDocument<StockSalesItem>;

@Schema({ timestamps: true, collection: 'stock_sales_items' })
export class StockSalesItem {

  /* ======================================================
   * REFERENCES
   * ====================================================== */

  @Prop({ type: String, required: true, index: true })
  stockSalesId: string;

  @Prop({ type: String, required: true, index: true })
  productId: string;

  /* ======================================================
   * PRICE & WEIGHT
   * ====================================================== */

  @Prop({ type: Number, required: true })
  price: number;

  @Prop({ type: Number, required: true })
  weight: number;

  /* ======================================================
   * SYSTEM STOCK SNAPSHOT
   * ====================================================== */

  @Prop({ type: Number, default: 0 })
  systemStock: number;

  @Prop({ type: Number, default: 0 })
  systemStockWeight: number;

  @Prop({ type: Number, default: 0 })
  systemStockValue: number;

  /* ======================================================
   * STOCK MOVEMENT
   * ====================================================== */

  @Prop({ type: Number, default: 0 })
  openingBalance: number;

  @Prop({ type: Number, default: 0 })
  receivedQuantity: number;

  @Prop({ type: Number, default: 0 })
  physicalStock: number;

  @Prop({ type: Number, default: 0 })
  returnsQuantity: number;

  @Prop({ type: Number, default: 0 })
  damageQuantity: number;

  @Prop({ type: Number, default: 0 })
  transferOutQuantity: number;

  @Prop({ type: Number, default: 0 })
  transferInQuantity: number;

  /* ======================================================
   * SALES
   * ====================================================== */

  @Prop({ type: Number, default: 0 })
  salesQuantity: number;

  @Prop({ type: Number, default: 0 })
  salesValue: number;

  @Prop({ type: Number, default: 0 })
  salesWeight: number;

  /* ======================================================
   * VARIANCE
   * ====================================================== */

  @Prop({ type: Number, default: 0 })
  expectedClosingBalance: number;

  @Prop({ type: Number, default: 0 })
  variance: number;

  @Prop({ type: Number, default: 0 })
  varianceWeight: number;
}

export const StockSalesItemSchema =
  SchemaFactory.createForClass(StockSalesItem);

StockSalesItemSchema.index(
  { stockSalesId: 1, productId: 1 },
  { unique: true },
);
