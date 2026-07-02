import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { VanInventoryTopupErpSyncStatus } from 'src/shared/enums/van-inventory-topup.enums';

export type VanInventoryTopupItemDocument =
  HydratedDocument<VanInventoryTopupItem>;

@Schema({ collection: 'van_inventory_topup_items', timestamps: true })
export class VanInventoryTopupItem {
  @Prop({ type: String, required: true, index: true })
  vanInventoryTopupId!: string;

  @Prop({ type: String, required: true, index: true })
  productId!: string;

  @Prop({ type: String, required: true })
  productName!: string;

  @Prop({ type: String, index: true })
  compCode?: string;

  /* ================= REQUESTED ================= */

  @Prop({ type: Number, default: 0 })
  requestedCaseQty!: number;

  @Prop({ type: Number, default: 0 })
  requestedPieceQty!: number;

  @Prop({ type: Number, required: true })
  requestedQty!: number;

  /* ================= APPROVED ================= */

  @Prop({ type: Number, default: 0 })
  approvedCaseQty!: number;

  @Prop({ type: Number, default: 0 })
  approvedPieceQty!: number;

  @Prop({ type: Number, default: 0 })
  approvedQty!: number;

  /* ================= PRICE ================= */

  @Prop({ type: Number, required: true })
  piecePrice!: number;

  @Prop({ type: Number, required: true })
  casePrice!: number;

  /* ================= WEIGHT ================= */

  @Prop({ type: Number, required: true })
  pieceNetWeight!: number;

  @Prop({ type: Number, required: true })
  caseNetWeight!: number;

  /* ================= TOTALS ================= */

  @Prop({ type: Number, default: 0 })
  requestedWeight!: number;

  @Prop({ type: Number, default: 0 })
  requestedValue!: number;

  @Prop({ type: Number, default: 0 })
  approvedWeight!: number;

  @Prop({ type: Number, default: 0 })
  approvedValue!: number;

  /* ================= CONVERSION ================= */

  @Prop({ required: true, type: Number })
  unitQtyInCase!: number;

  @Prop({ type: String, default: 'CS' })
  unitType!: string;

  /* ================= META ================= */

  @Prop()
  remark?: string;

  @Prop({ type: String, index: true })
  erpStockId?: string;

  @Prop({ type: Date })
  erpStockDate?: Date;

  @Prop({
    type: String,
    enum: VanInventoryTopupErpSyncStatus,
    default: VanInventoryTopupErpSyncStatus.PENDING,
    index: true,
  })
  erpRequestSyncStatus!: VanInventoryTopupErpSyncStatus;

  @Prop({ type: Number, default: 0 })
  erpRequestSyncAttempts!: number;

  @Prop({ type: Date })
  erpRequestSyncedAt?: Date;

  @Prop({ type: String })
  erpRequestSyncError?: string;

  @Prop({
    type: String,
    enum: VanInventoryTopupErpSyncStatus,
    default: VanInventoryTopupErpSyncStatus.PENDING,
    index: true,
  })
  erpStockTakeSyncStatus!: VanInventoryTopupErpSyncStatus;

  @Prop({ type: Number, default: 0 })
  erpStockTakeSyncAttempts!: number;

  @Prop({ type: Date })
  erpStockTakeSyncedAt?: Date;

  @Prop({ type: Date })
  erpStockTakeLastCheckedAt?: Date;

  @Prop({ type: String })
  erpStockTakeSyncError?: string;
}

export const VanInventoryTopupItemSchema = SchemaFactory.createForClass(
  VanInventoryTopupItem,
);

VanInventoryTopupItemSchema.index(
  { vanInventoryTopupId: 1, productId: 1 },
  { unique: true, name: 'unique_van_inventory_topup_product' },
);
