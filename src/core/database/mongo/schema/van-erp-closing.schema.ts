/**
 * Van ERP Closing Stock Collection
 * --------------------------------
 * Source : VAN_CLOSING_STOCK
 * Target : van_erp_closing
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { VanErpClosingStatus } from 'src/shared/enums/van-erp-closing.enums';

export type VanErpClosingDocument = HydratedDocument<VanErpClosing>;

@Schema({
  collection: 'van_erp_closing',
  timestamps: true,
})
export class VanErpClosing {
  /* ======================================================
   * IDENTITY
   * ====================================================== */

  @Prop({ required: true, unique: true, index: true, type: String })
  stockId!: string;

  /**
   * Normalized date only from DT_CLOSE_DATE
   */
  @Prop({ required: true, index: true, type: Date })
  date!: Date;

  /* ======================================================
   * NORMALIZED REFERENCES
   * ====================================================== */

  @Prop({ required: true, index: true, type: String })
  vanId!: string;

  @Prop({ required: true, index: true, type: String })
  productId!: string;

  @Prop({ type: Number, required: true, default: 0 })
  qtyInCase!: number;

  @Prop({
    type: String,
    enum: VanErpClosingStatus,
    default: VanErpClosingStatus.SYNCED,
    index: true,
  })
  status!: VanErpClosingStatus;

  /* ======================================================
   * ERP ORIGINAL COLUMNS
   * ====================================================== */

  @Prop({ type: String, index: true })
  compCode?: string; // VC_COMP_CODE

  @Prop({ type: String, index: true })
  vanCode?: string; // VC_VAN_CODE

  @Prop({ type: String, index: true })
  itemCode?: string; // VC_ITEM_CODE

  @Prop({ type: Number, default: 0 })
  qty?: number; // NU_QTY

  @Prop({ type: Date, index: true })
  closeDate?: Date; // DT_CLOSE_DATE

  @Prop({ type: String })
  syncStatus?: string; // CH_SYNC_STATUS

  @Prop({ type: Date })
  modifiedDate?: Date; // DT_MOD_DATE

  @Prop({ type: Number })
  epochTime?: number; // NU_EPOCHTIME

  @Prop({ type: String, index: true })
  erpStockId?: string; // VC_STOCK_ID

  @Prop({ type: String })
  time?: string; // VC_TIME

  @Prop({ type: Date })
  createdDate?: Date; // DT_CREATE_DATE
}

export const VanErpClosingSchema =
  SchemaFactory.createForClass(VanErpClosing);

/**
 * One record per Van + Product + Day
 */
VanErpClosingSchema.index(
  { date: 1, vanId: 1, productId: 1 },
  { unique: true, name: 'unique_van_erp_closing' },
);