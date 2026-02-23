/**
 * Customer Sales Items Collection
 * -------------------------------
 * Purpose : Store product-wise sales quantities with weight & value
 *
 * Notes:
 * - Product is referenced via product_master.productId
 * - Price & netWeight are snapshotted for audit
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CustomerSalesItemDocument = HydratedDocument<CustomerSalesItem>;

@Schema({ collection: 'customer_sales_items', timestamps: true })
export class CustomerSalesItem {
  /* ======================================================
   * REFERENCES
   * ====================================================== */

  // Customer sales reference (customer_sales.customerSalesId)
  @Prop({ type: String, required: true, index: true })
  saleId: string;

  // Product reference (product_master.productId)
  @Prop({ type: String, required: true, index: true })
  productId: string;

  /* ======================================================
   * SOLD DETAILS
   * ====================================================== */

  // Sold quantity
  @Prop({ type: Number, required: true, min: 0.0001 })
  quantity: number;

  @Prop({ type: Number, required: true, min: 0.0001 })
  returnQuantity: number;

  // Sold weight = soldQty * productNetWeight
  @Prop({ type: Number, default: 0 })
  netWeight: number;

  @Prop({ type: Number, default: 0 })
  totalWeight: number;

  // Sold value = soldQty * productPrice
  @Prop({ type: Number, default: 0 })
  totalValue: number;

  /* ======================================================
   * PRODUCT SNAPSHOT (FOR AUDIT)
   * ====================================================== */

  // Snapshot of product price at time of sale
  @Prop({ type: Number, required: true })
  price: number;
}

export const CustomerSalesItemSchema =
  SchemaFactory.createForClass(CustomerSalesItem);

/**
 * One product per Customer Sale
 */
CustomerSalesItemSchema.index(
  { saleId: 1 },
  { unique: true, name: 'unique_customer_sales_product' },
);
