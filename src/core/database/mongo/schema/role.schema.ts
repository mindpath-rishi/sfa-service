/**
 * Roles Collection
 * ----------------
 * Purpose : Role & permission management (RBAC)
 * Used by : EMPLOYEE / ADMIN
 *
 * Contains:
 * - Role identity
 * - Reporting role
 * - Permission list
 * - Van association limits
 * - Status
 *
 * Notes:
 * - Permissions are string-based for flexibility
 * - Van limits are enforced at service layer
 * - reportingTo stores another roleId
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Status } from 'src/shared/enums/app.enums';

@Schema({
  collection: 'roles',
})
export class Role extends Document {
  /* ======================================================
   * ROLE ID
   * ====================================================== */

  @Prop({ required: true, unique: true, index: true, type: String })
  roleId!: string;

  /* ======================================================
   * ROLE INFO
   * ====================================================== */

  @Prop({
    type: String,
    required: true,
  })
  name!: string;

  @Prop({
    type: String,
    required: true,
    unique: true,
    index: true,
  })
  displayName!: string;

  @Prop({ type: String })
  description?: string;

  /* ======================================================
   * REPORTING ROLE
   * ====================================================== */

  /**
   * reportingTo stores another roleId.
   *
   * Example:
   * SALESMAN reports to SUPERVISOR
   * DRIVER reports to SUPERVISOR
   * SUPERVISOR reports to MANAGER
   */
  @Prop({
    type: String,
    required: false,
    trim: true,
    index: true,
  })
  reportingTo?: string;

  /* ======================================================
   * VAN ASSOCIATION RULES
   * ====================================================== */

  @Prop({
    type: Number,
    default: 0,
    min: -1,
  })
  maxAssociatedVans!: number;

  /**
   * -1 → unlimited
   *  0 → no vans
   *  N → max N vans
   */

  /* ======================================================
   * PERMISSIONS
   * ====================================================== */

  @Prop({
    type: [String],
    default: [],
  })
  permissions!: string[];

  /* ======================================================
   * STATUS
   * ====================================================== */

  @Prop({
    type: String,
    enum: Status,
    default: Status.ACTIVE,
    index: true,
  })
  status!: Status;

  @Prop({ default: false, index: true, type: Boolean })
  isSystemAdmin!: boolean;
}

export const RoleSchema = SchemaFactory.createForClass(Role);

/* ======================================================
 * INDEXES
 * ====================================================== */

RoleSchema.index({ reportingTo: 1 }, { name: 'idx_role_reporting_to' });
