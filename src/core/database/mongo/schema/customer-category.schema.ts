/**
 * Customer Categories Collection
 * ------------------------------
 * Purpose : Customer classification and grouping
 * Used by : BACK_OFFICE / ADMIN / SALES
 *
 * Contains:
 * - Category identity
 * - Category name
 * - Category status
 *
 * Notes:
 * - Customer categories are used for segmentation and reporting
 * - Soft deletes preserve audit history
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { CustomerCategoryStatus } from 'src/shared/constants/customer-category.constants';

export type CustomerCategoryDocument = HydratedDocument<CustomerCategory>;

@Schema({ collection: 'customer_categories', timestamps: true })
export class CustomerCategory {
  /* ======================================================
   * IDENTITY
   * ====================================================== */

  // Unique business identifier for customer category
  @Prop({ required: true, unique: true })
  customerCategoryId: string;

  // Display name of customer category
  @Prop({ required: true, unique: true })
  name: string;

  /* ======================================================
   * STATUS
   * ====================================================== */

  // Customer category availability status
  @Prop({
    type: String,
    enum: CustomerCategoryStatus,
    default: CustomerCategoryStatus.ACTIVE,
  })
  status: CustomerCategoryStatus;
}

export const CustomerCategorySchema =
  SchemaFactory.createForClass(CustomerCategory);
