import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StockCountItemDocument = HydratedDocument<StockCountItem>;

@Schema({ timestamps: true, collection: 'stock_count_items' })
export class StockCountItem {
  /* ======================================================
   * REFERENCES
   * ====================================================== */

  @Prop({ type: String, required: true, index: true })
  stockCountId!: string;

  @Prop({ type: String, required: true, index: true })
  productId!: string;

  @Prop({ type: String })
  productName?: string; // 🔥 denormalized (faster UI)

  @Prop({ type: String, index: true })
  vanId?: string;

  /* ======================================================
   * SYSTEM STOCK (EXPECTED)
   * ====================================================== */

  @Prop({ type: Number, required: true })
  systemQty!: number;

  @Prop({ type: Number, default: 0 })
  systemCases!: number;

  @Prop({ type: Number, default: 0 })
  systemPieces!: number;

  /* ======================================================
   * PHYSICAL STOCK (COUNTED)
   * ====================================================== */

  @Prop({ type: Number, required: true })
  countedQty!: number;

  @Prop({ type: Number, default: 0 })
  countedCases!: number;

  @Prop({ type: Number, default: 0 })
  countedPieces!: number;

  /* ======================================================
   * VARIANCE (AUTO / STORED)
   * ====================================================== */

  @Prop({ type: Number, required: true })
  varianceQty!: number; // counted - system

  @Prop({ type: Number, default: 0 })
  varianceCases!: number;

  @Prop({ type: Number, default: 0 })
  variancePieces!: number;

  /* ======================================================
   * PRICE & VALUE
   * ====================================================== */

  @Prop({ type: Number, required: true })
  piecePrice!: number;

  @Prop({ type: Number, required: true })
  systemValue!: number;

  @Prop({ type: Number, required: true })
  countedValue!: number;

  @Prop({ type: Number, required: true })
  varianceValue!: number;

  /* ======================================================
   * META
   * ====================================================== */

  @Prop({ type: Number, required: true })
  unitQtyInCase!: number;

  @Prop()
  remark?: string;

  @Prop({ type: String })
  countedBy?: string;

  @Prop({ type: Date })
  countedAt?: Date;
}

export const StockCountItemSchema =
  SchemaFactory.createForClass(StockCountItem);

/* ======================================================
 * UNIQUE INDEX
 * ====================================================== */

StockCountItemSchema.index(
  { stockCountId: 1, productId: 1 },
  { unique: true, name: 'unique_stock_count_item' },
);
