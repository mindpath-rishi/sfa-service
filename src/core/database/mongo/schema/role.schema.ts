/**
 * Roles Collection
 * ----------------
 * Purpose : Role & permission management (RBAC)
 * Used by : EMPLOYEE / ADMIN
 *
 * Contains:
 * - Role identity
 * - Permission list
 * - Status
 *
 * Notes:
 * - Permissions are string-based for flexibility
 * - Timestamps handled by global mongoose plugin
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { UserRole, Status } from 'src/shared/enums/app.enum';

@Schema({
  collection: 'roles',
})
export class Role extends Document {
  /* ======================================================
   * ROLE ID
   * ====================================================== */

  @Prop({ required: true, unique: true, index: true })
  roleId: string;

  /* ======================================================
   * ROLE INFO
   * ====================================================== */

  @Prop({
    type: String,
    enum: UserRole,
    required: true,
    unique: true,
    index: true,
  })
  name: string;

  @Prop()
  description?: string;

  /* ======================================================
   * PERMISSIONS
   * ====================================================== */

  @Prop({
    type: [String],
    default: [],
  })
  permissions: string[];

  /* ======================================================
   * STATUS
   * ====================================================== */

  @Prop({
    type: String,
    enum: Status,
    default: Status.ACTIVE,
    index: true,
  })
  status: Status;
}

export const RoleSchema = SchemaFactory.createForClass(Role);
