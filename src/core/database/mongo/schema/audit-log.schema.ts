/**
 * Audit Logs Collection
 * --------------------
 * Purpose : System-wide audit trail for critical actions
 * Used by : ALL MODULES (read-only access)
 *
 * Contains:
 * - Entity reference and action performed
 * - Before & after state snapshots
 * - Actor (employee) information
* - Request metadata
 *
 * Notes:
 * - Audit logs are immutable once created
 * - Used for compliance, debugging, and traceability
 */

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
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

/* ==================== INDEXES ==================== */

// Fast entity timeline lookup
AuditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });

// Actor-based audit lookup
AuditLogSchema.index({ 'performedBy.employeeId': 1, createdAt: -1 });
