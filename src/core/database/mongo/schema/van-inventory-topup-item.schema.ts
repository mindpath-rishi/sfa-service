/**
 * Van Inventory Top-Up Items Collection
 * ------------------------------------
 * Purpose : Store requested & approved quantities per product for each van top-up
 * Used by : BACK_OFFICE / ADMIN / SALES
 *
 * Contains:
 * - Top-up reference
 * - Product reference
 * - Requested quantities (qty / weight / value)
 * - Approved quantities (qty / weight / value)
 *
 * Notes:
 * - Product is referenced via product_master.productId
 * - All identifiers are stored as String (no ObjectId)
 * - Weight & value are derived from Product master
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type VanInventoryTopupItemDocument =
  HydratedDocument<VanInventoryTopupItem>;

@Schema({ collection: 'van_inventory_topup_items', timestamps: true })
export class VanInventoryTopupItem {
  /* ======================================================
   * REFERENCES
   * ====================================================== */

  // Van Inventory Top-Up reference (van_inventory_topup.vanInventoryTopupId)
  @Prop({ type: String, required: true, index: true })
  vanInventoryTopupId: string;

  // Product reference (product_master.productId)
  @Prop({ type: String, required: true, index: true })
  productId: string;

  /* ======================================================
   * REQUESTED DETAILS
   * ====================================================== */

  // Requested quantity
  @Prop({ type: Number, required: true, min: 0.0001 })
  requestedQty: number;

  // Requested weight = requestedQty * product_master.netWeight
  @Prop({ type: Number, default: 0 })
  requestedWeight: number;

  // Requested value = requestedQty * product_master.price
  @Prop({ type: Number, default: 0 })
  requestedValue: number;

  /* ======================================================
   * APPROVED DETAILS
   * ====================================================== */

  // Approved quantity
  @Prop({ type: Number, default: 0, min: 0 })
  approvedQty: number;

  // Approved weight = approvedQty * product_master.netWeight
  @Prop({ type: Number, default: 0 })
  approvedWeight: number;

  // Approved value = approvedQty * product_master.price
  @Prop({ type: Number, default: 0 })
  approvedValue: number;

  /* ======================================================
   * PRODUCT SNAPSHOT (FOR AUDIT)
   * ====================================================== */

  // Snapshot of product price at time of top-up
  @Prop({ type: Number, required: true })
  productPrice: number;

  // Snapshot of product net weight at time of top-up
  @Prop({ type: Number, required: true })
  productNetWeight: number;

  /* ======================================================
   * META
   * ====================================================== */

  // Optional remark per item
  @Prop()
  remark?: string;
}

export const VanInventoryTopupItemSchema =
  SchemaFactory.createForClass(VanInventoryTopupItem);

/**
 * One product per Van Inventory Top-Up
 */
VanInventoryTopupItemSchema.index(
  { vanInventoryTopupId: 1, productId: 1 },
  { unique: true, name: 'unique_van_inventory_topup_product' },
);