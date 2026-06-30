/**
 * User Target Collection
 * ----------------------
 * Purpose : Store user target assignments and achievements
 * Used by : APP / ADMIN / REPORTING
 *
 * Contains:
 * - User identity
 * - Category classification
 * - Cases, tonnage and value targets
 * - Target period
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TargetDocument = HydratedDocument<Target>;

@Schema({ timestamps: true })
export class Target {
  /* ======================================================
   * USER DETAILS
   * ====================================================== */

  // User reference
  @Prop({ required: true, type: String })
  userId!: string;

  // User name snapshot
  @Prop({ type: String })
  userName!: string;

  /* ======================================================
   * CATEGORY DETAILS
   * ====================================================== */

  // Parent category reference
  @Prop({ required: true, type: String })
  parentCategoryId!: string;

  // Parent category name snapshot
  @Prop({ required: true, trim: true, type: String })
  parentCategory!: string;

  // Child category reference
  @Prop({ required: true, type: String })
  categoryId!: string;

  // Child category name snapshot
  @Prop({ required: true, trim: true, type: String })
  category!: string;

  // Remarks / description
  @Prop({ trim: true, type: String })
  description?: string;

  /* ======================================================
   * TARGET VALUES
   * ====================================================== */

  // Planned cases target
  @Prop({ type: Number, default: 0 })
  targetCases!: number;

  // Planned tonnage target
  @Prop({ type: Number, default: 0 })
  targetTonnage!: number;

  // Planned value target
  @Prop({ type: Number, default: 0 })
  targetValue!: number;

  /* ======================================================
   * TARGET PERIOD
   * ====================================================== */

  // Target start date
  @Prop({ required: true, type: Date })
  startDate!: Date;

  // Target end date
  @Prop({ required: true, type: Date })
  endDate!: Date;
}

export const TargetSchema = SchemaFactory.createForClass(Target);

TargetSchema.index({ userId: 1 });
TargetSchema.index({ parentCategoryId: 1 });
TargetSchema.index({ categoryId: 1 });
TargetSchema.index({ startDate: 1, endDate: 1 });
