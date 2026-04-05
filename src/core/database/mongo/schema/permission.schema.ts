/**
 * Permissions Collection
 * ---------------------
 * Purpose : Define atomic permissions for RBAC
 * Used by : AUTHORIZATION / RBAC / ACCESS CONTROL
 *
 * Contains:
 * - Unique permission codes
 * - Human-readable names
 * - Module-level grouping
 * - Permission status
 *
 * Notes:
 * - Permissions are string-based for flexibility
 * - Assigned to roles, not directly to users
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Status } from 'src/shared/enums/app.enums';

export type PermissionDocument = Permission & Document;

@Schema({ timestamps: true })
export class Permission {
  /* ======================================================
   * IDENTITY
   * ====================================================== */

  // Unique permission code (used in guards and decorators)
  @Prop({ required: true, unique: true, trim: true, type: String })
  code: string;

  // Human-readable permission name
  @Prop({ required: true, trim: true, type: String })
  name: string;

  /* ======================================================
   * CLASSIFICATION
   * ====================================================== */

  // Logical module grouping (EMPLOYEE, ORDER, INVENTORY, etc.)
  @Prop({ required: true, trim: true, type: String })
  module: string;

  /* ======================================================
   * STATUS
   * ====================================================== */

  // Permission status
  @Prop({
    type: String,
    enum: Status,
    default: Status.ACTIVE,
    index: true,
  })
  status: Status;
}

export const PermissionSchema = SchemaFactory.createForClass(Permission);
