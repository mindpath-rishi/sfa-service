import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  RESTORE = 'RESTORE',
}

@Schema({
  collection: 'audit_logs',
  timestamps: { createdAt: true, updatedAt: false },
})
export class AuditLog extends Document {
  /* ======================================================
   * ENTITY INFO
   * ====================================================== */

  @Prop({ required: true, index: true })
  entity: string; // e.g. Customer, Employee, Order

  @Prop({ required: true, index: true })
  entityId: string; // customerId / employeeId / orderId

  @Prop({
    type: String,
    enum: AuditAction,
    required: true,
    index: true,
  })
  action: AuditAction;

  /* ======================================================
   * CHANGE SNAPSHOTS
   * ====================================================== */

  @Prop({ type: MongooseSchema.Types.Mixed })
  before?: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  after?: Record<string, any>;

  /* ======================================================
   * WHO PERFORMED ACTION
   * ====================================================== */

  @Prop({
    type: {
      employeeId: { type: String, required: true },
      name: { type: String },
      role: { type: String },
    },
    required: true,
  })
  performedBy: {
    employeeId: string;
    name?: string;
    role?: string;
  };

  /* ======================================================
   * REQUEST METADATA
   * ====================================================== */

  @Prop({
    type: {
      ip: String,
      userAgent: String,
    },
  })
  metadata?: {
    ip?: string;
    userAgent?: string;
  };

  /* ======================================================
   * TIMESTAMP
   * ====================================================== */

  createdAt: Date; // auto from timestamps
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

/* ==================== INDEXES ==================== */

// Fast entity timeline lookup
AuditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });

// Actor-based lookup
AuditLogSchema.index({ 'performedBy.employeeId': 1, createdAt: -1 });
