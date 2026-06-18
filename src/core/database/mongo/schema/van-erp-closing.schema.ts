/**
 * Van Daily Stock Collection
 * -------------------------
 * Purpose : Store opening & closing stock per van per day
 * Used by : BACK_OFFICE / ADMIN / SALES
 *
 * Contains:
 * - Date reference
 * - Van reference
 * - Product reference
 * - Opening stock
 * - Inbound quantity
 * - Outbound quantity
 * - Adjustment quantity
 * - Closing stock
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { VanErpClosingStatus } from 'src/shared/enums/van-erp-closing.enums';

export type VanDailyStockDocument = HydratedDocument<VanErpClosing>;

@Schema({ collection: 'van_erp_closing' })
export class VanErpClosing {
  /* ======================================================
   * IDENTITY
   * ====================================================== */

  @Prop({ required: true, unique: true, index: true, type: String })
  stockId!: string;

  @Prop({ required: true, index: true, type: Date })
  date!: Date;

  /* ======================================================
   * VAN, EMPLOYEE & PRODUCT REFERENCES
   * ====================================================== */

  @Prop({ required: true, index: true, type: String })
  vanId!: string;

  @Prop({ required: true, index: true, type: String })
  productId!: string;

  @Prop({ type: Number, required: true })
  qtyInCase!: number;

  @Prop({
    type: String,
    enum: VanErpClosingStatus,
    default: VanErpClosingStatus.SYNCED,
    index: true,
  })
  status!: VanErpClosingStatus;
}

export const VanErpClosingSchema = SchemaFactory.createForClass(VanErpClosing);

/**
 * One record per Van + Product + Day
 */
VanErpClosingSchema.index(
  { date: 1, vanId: 1, productId: 1 },
  { unique: true, name: 'unique_van_erp_closing' },
);
