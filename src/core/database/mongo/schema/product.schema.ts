/**
 * Products Collection
 * -------------------
 * Purpose : Product master and pricing context
 * Used by : BACK_OFFICE / ADMIN / SALES
 *
 * Contains:
 * - Product identity and system codes
 * - Category association
 * - Pricing and weight information
 * - Unit configuration
 * - Product availability status
 *
 * Notes:
 * - Category is referenced via ProductCategory collection
 * - All identifiers are stored as String (no ObjectId)
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  PriceType,
  ProductStatus,
} from 'src/shared/enums/product.enums';

export type ProductDocument = HydratedDocument<Product>;

@Schema({ collection: 'product_master' })
export class Product {
  /* ======================================================
   * IDENTITY
   * ====================================================== */

  // Unique business identifier for the product
  @Prop({ required: true, trim: true, unique: true })
  productId: string;

  // Display name of the product
  @Prop({ required: true, trim: true })
  name: string;

  // System generated product code
  @Prop({ required: true, trim: true, unique: true })
  productSysCode: string;

  /* ======================================================
   * ASSOCIATIONS
   * ====================================================== */

  // Product category reference
  @Prop({ required: true, type: String, ref: 'ProductCategory' })
  categoryId: string;

  /* ======================================================
   * PRICING / WEIGHT
   * ====================================================== */

  // Product selling price
  @Prop({ required: true })
  price: number;

  // Net weight of product
  @Prop({ required: true })
  netWeight: number;

  // Price classification
  @Prop({
    type: String,
    enum: PriceType,
    default: PriceType.STANDARD,
  })
  priceType: PriceType;

  /* ======================================================
   * UNIT DETAILS
   * ====================================================== */

  // Unit type (example: box, bottle)
  @Prop()
  unitType?: string;

  // Unit size (example: 500ml)
  @Prop()
  unitSize?: string;

  // Quantity per case
  @Prop()
  unitQtyInCase?: string;

  /* ======================================================
   * STATUS
   * ====================================================== */

  // Product availability status
  @Prop({
    type: String,
    enum: ProductStatus,
    default: ProductStatus.ACTIVE,
  })
  status: ProductStatus;
}

export const ProductSchema = SchemaFactory.createForClass(Product);
