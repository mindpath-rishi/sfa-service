import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { AuditAction } from 'src/shared/enums/app.enums';

@Schema({
  collection: 'audit_logs',
})
export class AuditLog extends Document {
  /* ======================================================
   * ENTITY INFO
   * ====================================================== */

  @Prop({ required: true, index: true })
  entity!: string; // customers / orders / inventoryTransactions / etc.

  @Prop({ required: true, index: true })
  entityId!: string; // customerId / saleId / transactionId / etc.

  @Prop({
    type: String,
    enum: AuditAction,
    required: true,
    index: true,
  })
  action!: AuditAction;

  /* ======================================================
   * CHANGE SNAPSHOTS
   * ====================================================== */

  @Prop({ type: MongooseSchema.Types.Mixed })
  before?: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  after?: Record<string, any>;

  /* ======================================================
   * ACTOR INFORMATION
   * ====================================================== */

  @Prop({
    type: {
      employeeId: { type: String, required: true },
      name: { type: String },
      role: { type: String },
    },
    required: true,
  })
  performedBy!: {
    employeeId: string;
    name?: string;
    role?: string;
  };

  /* ======================================================
   * REQUEST / SYNC METADATA
   * ====================================================== */

  @Prop({
    type: MongooseSchema.Types.Mixed,
  })
  metadata?: {
    ip?: string;
    userAgent?: string;

    source?: 'ONLINE' | 'OFFLINE_SYNC';
    queueId?: string;
    localId?: string;
    operation?: string;
    syncStatus?: 'SUCCESS' | 'FAILED';
    error?: string;
    serverId?: string;
    version?: number;
    breakdownReason?: string;
  };
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

/* ==================== INDEXES ==================== */

AuditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });

AuditLogSchema.index({ 'performedBy.employeeId': 1, createdAt: -1 });

AuditLogSchema.index({ action: 1, createdAt: -1 });

AuditLogSchema.index({ 'metadata.source': 1, createdAt: -1 });

AuditLogSchema.index({ 'metadata.queueId': 1 });
