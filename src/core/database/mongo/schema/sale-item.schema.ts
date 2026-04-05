/**
 * Customer Sales Items Collection
 * -------------------------------
 * Purpose : Store product-wise sales quantities (cases + pieces)
 *
 * Notes:
 * - Quantity is stored as:
 *    cases + pieces → raw
 *    quantity → derived (units)
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SaleItemDocument = HydratedDocument<SaleItem>;

@Schema({ collection: 'customer_sale_items', timestamps: true })
export class SaleItem {
  /* ================= REFERENCES ================= */

  @Prop({ type: String, required: true, index: true })
  saleId: string;

  @Prop({ type: String, required: true, index: true })
  productId: string;

  @Prop({ type: String, required: true })
  productName: string;

  /* ================= QUANTITY ================= */

  @Prop({ type: Number, default: 0 })
  caseQty: number;

  @Prop({ type: Number, default: 0 })
  pieceQty: number;

  @Prop({ type: Number, required: true })
  quantity: number;

  /* ================= RETURNS ================= */

  @Prop({ type: Number, default: 0 })
  returnCaseQty: number;

  @Prop({ type: Number, default: 0 })
  returnPieceQty: number;

  @Prop({ type: Number, default: 0 })
  returnQty: number;

  /* ================= PRICE ================= */

  // 🔥 Base (source of truth)
  @Prop({ type: Number, required: true })
  piecePrice: number;

  // 🔥 Derived snapshot
  @Prop({ type: Number, required: true })
  casePrice: number;

  /* ================= WEIGHT ================= */

  // 🔥 Base (source of truth)
  @Prop({ type: Number, required: true })
  pieceNetWeight: number;

  // 🔥 Derived snapshot
  @Prop({ type: Number, required: true })
  caseNetWeight: number;

  /* ================= TOTALS ================= */

  @Prop({ type: Number, default: 0 })
  totalWeight: number;

  @Prop({ type: Number, default: 0 })
  totalValue: number;

  /* ================= CONVERSION ================= */

  @Prop({ required: true, type: Number })
  unitQtyInCase: number;
}

export const SaleItemSchema = SchemaFactory.createForClass(SaleItem);

/* ======================================================
 * INDEXES
 * ====================================================== */

// ✅ One product per sale
SaleItemSchema.index(
  { saleId: 1, productId: 1 },
  { unique: true, name: 'unique_customer_sales_product' },
);
