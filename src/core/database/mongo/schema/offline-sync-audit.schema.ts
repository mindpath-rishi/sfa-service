// offline-sync-audit.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type OfflineSyncAuditDocument = HydratedDocument<OfflineSyncAudit>;

@Schema({
  collection: 'offline_sync_audit_logs',
})
export class OfflineSyncAudit {
  @Prop({ required: true, unique: true, index: true, type: String })
  auditId!: string;

  @Prop({ required: true, index: true, type: String })
  queueId!: string;

  @Prop({ required: true, index: true, type: String })
  ownerId!: string;

  @Prop({ required: true, index: true, type: String })
  entity!: string;

  @Prop({ required: true, index: true, type: String })
  operation!: string; // CREATE | UPDATE | DELETE

  @Prop({ required: true, index: true, type: String })
  localId!: string;

  @Prop({ type: String, index: true })
  businessId?: string;

  @Prop({ type: String, index: true })
  serverId?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  rawPayload?: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  cleanedPayload?: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  before?: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  after?: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  result?: Record<string, unknown>;

  @Prop({
    type: String,
    enum: ['PENDING', 'SUCCESS', 'FAILED'],
    default: 'PENDING',
    index: true,
  })
  status!: 'PENDING' | 'SUCCESS' | 'FAILED';

  @Prop({ type: String })
  error?: string;

  @Prop({ type: Number, default: 1 })
  version!: number;

  @Prop({
    type: {
      employeeId: { type: String },
      name: { type: String },
      role: { type: String },
    },
  })
  performedBy?: {
    employeeId?: string;
    name?: string;
    role?: string;
  };

  @Prop({
    type: {
      source: { type: String, default: 'OFFLINE_SYNC' },
      appVersion: String,
      deviceId: String,
      platform: String,
      syncedAt: Date,
    },
  })
  metadata?: {
    source?: string;
    appVersion?: string;
    deviceId?: string;
    platform?: string;
    syncedAt?: Date;
  };
}

export const OfflineSyncAuditSchema =
  SchemaFactory.createForClass(OfflineSyncAudit);

OfflineSyncAuditSchema.index({ ownerId: 1, createdAt: -1 });
OfflineSyncAuditSchema.index({ entity: 1, localId: 1 });
OfflineSyncAuditSchema.index({ entity: 1, businessId: 1 });
OfflineSyncAuditSchema.index({ status: 1, createdAt: -1 });
OfflineSyncAuditSchema.index({ queueId: 1, entity: 1 });