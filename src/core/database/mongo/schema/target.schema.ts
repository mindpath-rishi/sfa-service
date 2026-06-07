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
 * - Achievement tracking
 * - Target period
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { TargetStatus } from 'src/shared/enums/target.enums';

export type TargetDocument = HydratedDocument<Target>;

@Schema()
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

  // Category reference
  @Prop({ required: true, type: String })
  categoryId!: string;

  // Category name snapshot
  @Prop({ required: true, trim: true, type: String })
  category!: string;

  // Sub-category reference
  @Prop({ type: String })
  subCategoryId?: string;

  // Sub-category name snapshot
  @Prop({ trim: true, type: String })
  subCategory?: string;

  // Remarks / description
  @Prop({ trim: true, type: String })
  description?: string;

  /* ======================================================
   * TARGET VALUES
   * ====================================================== */

  // Planned cases target
  @Prop({ type: Number, default: 0 })
  targetCases!: number;

  // Achieved cases
  @Prop({ type: Number, default: 0 })
  achievedCases!: number;

  // Planned tonnage target
  @Prop({ type: Number, default: 0 })
  targetTonnage!: number;

  // Achieved tonnage
  @Prop({ type: Number, default: 0 })
  achievedTonnage!: number;

  // Planned value target
  @Prop({ type: Number, default: 0 })
  targetValue!: number;

  // Achieved value
  @Prop({ type: Number, default: 0 })
  achievedValue!: number;

  /* ======================================================
   * TARGET PERIOD
   * ====================================================== */

  // Target start date
  @Prop({ required: true, type: Date })
  startDate!: Date;

  // Target end date
  @Prop({ required: true, type: Date })
  endDate!: Date;

  /* ======================================================
   * STATUS
   * ====================================================== */

  @Prop({
    required: true,
    type: String,
    default: TargetStatus.ACTIVE,
  })
  status!: string;
}

export const TargetSchema = SchemaFactory.createForClass(Target);

TargetSchema.index({ userId: 1 });
TargetSchema.index({ categoryId: 1 });
TargetSchema.index({ subCategoryId: 1 });
TargetSchema.index({ startDate: 1, endDate: 1 });
TargetSchema.index({ status: 1 });
