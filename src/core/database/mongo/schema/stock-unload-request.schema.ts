import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { StockUnloadRequestStatus } from 'src/shared/enums/stock-unload-request.enums';

export type StockUnloadRequestDocument = HydratedDocument<StockUnloadRequest>;

@Schema({ _id: false })
export class StockUnloadRequestItem {
  @Prop({ required: true, type: String })
  productId!: string;

  @Prop({ type: String })
  productName?: string;

  @Prop({ type: Number, default: 0 })
  quantity!: number;

  @Prop({ type: Number, default: 0 })
  cases!: number;

  @Prop({ type: Number, default: 0 })
  pieces!: number;

  @Prop({ type: Number, default: 0 })
  value!: number;

  @Prop({ type: Number, default: 0 })
  unitQtyInCase!: number;
}

const StockUnloadRequestItemSchema = SchemaFactory.createForClass(
  StockUnloadRequestItem,
);

@Schema({ timestamps: true, collection: 'stock_unload_requests' })
export class StockUnloadRequest {
  @Prop({ required: true, unique: true, index: true, type: String })
  unloadRequestId!: string;

  @Prop({ required: true, unique: true, index: true, type: String })
  workSessionId!: string;

  @Prop({ required: true, index: true, type: String })
  vanId!: string;

  @Prop({ required: true, index: true, type: String })
  employeeId!: string;

  @Prop({ type: String })
  employeeName?: string;

  @Prop({ type: String, index: true })
  managerId?: string;

  @Prop({ type: String })
  warehouseId?: string;

  @Prop({ type: Number, default: 0 })
  totalQuantity!: number;

  @Prop({ type: Number, default: 0 })
  totalCases!: number;

  @Prop({ type: Number, default: 0 })
  totalPieces!: number;

  @Prop({ type: Number, default: 0 })
  totalValue!: number;

  @Prop({ type: [StockUnloadRequestItemSchema], default: [] })
  items!: StockUnloadRequestItem[];

  @Prop({
    required: true,
    type: String,
    enum: StockUnloadRequestStatus,
    default: StockUnloadRequestStatus.PENDING,
    index: true,
  })
  status!: StockUnloadRequestStatus;

  @Prop({ type: String })
  resolvedBy?: string;

  @Prop({ type: Date })
  resolvedAt?: Date;

  @Prop({ type: String })
  rejectionReason?: string;
}

export const StockUnloadRequestSchema =
  SchemaFactory.createForClass(StockUnloadRequest);

StockUnloadRequestSchema.index({ managerId: 1, status: 1, createdAt: -1 });
StockUnloadRequestSchema.index({ employeeId: 1, createdAt: -1 });
