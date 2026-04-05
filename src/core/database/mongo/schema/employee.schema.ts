/**
 * Employees Collection
 * -------------------
 * Purpose : Employee profile and authorization context
 * Used by : BACK_OFFICE / ADMIN
 *
 * Contains:
 * - Employee identity and contact details
 * - Role reference for RBAC
 * - Assigned vans and permission overrides
 * - Account status
 *
 * Notes:
 * - Authentication credentials are stored in the User collection
 * - Permission overrides are applied on top of role permissions
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument } from 'mongoose';
import { UserStatus } from 'src/modules/v1/user/user.enum';

export type EmployeeDocument = HydratedDocument<Employee>;

@Schema({ timestamps: true })
export class Employee {
  /* ======================================================
   * IDENTITY
   * ====================================================== */

  // Unique business identifier for the employee
  @Prop({ required: true, trim: true, type: String })
  employeeId: string;

  // Optional contact mobile number
  @Prop({
    required: false,
    trim: true,
    unique: true,
    sparse: true,
    type: String,
  })
  mobile?: string;

  // Display name of the employee
  @Prop({ required: true, trim: true, type: String })
  name: string;

  // Optional email address
  @Prop({
    required: false,
    lowercase: true,
    trim: true,
    unique: true,
    sparse: true,
    type: String,
  })
  email?: string;

  /* ======================================================
   * AUTHORIZATION
   * ====================================================== */

  // Role reference used for RBAC
  @Prop({ required: true, type: String })
  roleId: string;

  /* ======================================================
   * ASSOCIATIONS
   * ====================================================== */

  // Vans assigned to the employee
  @Prop({
    type: [String],
    default: [],
  })
  associatedVans: string[];

  /* ======================================================
   * PERMISSION OVERRIDES
   * ====================================================== */

  // Fine-grained permission overrides applied over role permissions
  @Prop({
    type: {
      allow: { type: [String], default: [] },
      deny: { type: [String], default: [] },
    },
    default: { allow: [], deny: [] },
  })
  permissionOverrides: {
    allow: string[];
    deny: string[];
  };

  /* ======================================================
   * STATUS
   * ====================================================== */

  // Employee account status
  @Prop({
    type: String,
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);
