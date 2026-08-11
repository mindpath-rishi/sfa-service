/**
 * Product Categories Collection
 * -----------------------------
 * Purpose : Product classification and grouping
 * Used by : BACK_OFFICE / ADMIN
 *
 * Contains:
 * - Category identity
 * - Category name
 * - Category status
 *
 * Notes:
 * - Categories are referenced by Product master
 * - Soft deletes preserve audit history
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProductCategoryDocument = HydratedDocument<ProductCategory>;

export enum ProductCategoryStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum ProductCategoryType {
  PARENT = 'PARENT',
  CHILD = 'CHILD',
}

@Schema({ timestamps: true })
export class ProductCategory {
  /* ======================================================
   * IDENTITY
   * ====================================================== */

  // Unique business identifier for category
  @Prop({ required: true, unique: true, type: String })
  categoryId!: string;

  // Display name of category
  @Prop({ required: true, index: true, type: String })
  name!: string;

  @Prop({
    required: true,
    type: String,
    enum: ProductCategoryType,
    default: ProductCategoryType.PARENT,
    index: true,
  })
  type!: ProductCategoryType;

  @Prop({ required: false, type: String, index: true })
  parentId?: string;

  /* ======================================================
   * STATUS
   * ====================================================== */

  // Category availability status
  @Prop({
    type: String,
    enum: ProductCategoryStatus,
    default: ProductCategoryStatus.ACTIVE,
  })
  status!: ProductCategoryStatus;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const ProductCategorySchema =
  SchemaFactory.createForClass(ProductCategory);

ProductCategorySchema.index({ type: 1, parentId: 1, status: 1 });
ProductCategorySchema.index(
  { type: 1, parentId: 1, name: 1 },
  { unique: true, name: 'unique_category_name_per_parent' },
);
