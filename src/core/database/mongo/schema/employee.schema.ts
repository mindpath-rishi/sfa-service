/**
 * Employees Collection
 * -------------------
 * Purpose : Employee profile and authorization context
 * Used by : BACK_OFFICE / ADMIN
 *
 * Contains:
 * - Employee identity and contact details
 * - Employee reporting hierarchy
 * - Permission overrides
 * - Account status
 *
 * Notes:
 * - Authentication credentials are stored in the User collection
 * - Permission overrides are applied on top of role permissions
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { UserStatus } from 'src/modules/v1/user/user.enum';
import { EmployeeType } from 'src/shared/enums/employee.enums';

export type EmployeeDocument = HydratedDocument<Employee>;

@Schema({ timestamps: true })
export class Employee {
  /* ======================================================
   * IDENTITY
   * ====================================================== */

  // Unique business identifier for the employee
  @Prop({
    required: true,
    trim: true,
    unique: true,
    index: true,
    type: String,
  })
  employeeId!: string;

  @Prop({
    type: String,
    enum: EmployeeType,
    default: EmployeeType.STAFF,
    required: true,
    index: true,
  })
  employeeType!: EmployeeType;

  @Prop({
    required: false,
    trim: true,
    index: true,
    type: String,
  })
  manNumber?: string;

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
  @Prop({
    required: true,
    trim: true,
    type: String,
  })
  name!: string;

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

  @Prop({ required: false, type: String })
  profileImageMediaId?: string;

  @Prop({ required: false, type: String })
  profileImageUrl?: string;

  /* ======================================================
   * HIERARCHY
   * ====================================================== */

  // Complete reporting chain
  // Example for Salesman:
  // ["CM001", "MGR001", "TL001"]
  @Prop({
    type: [String],
    default: [],
    index: true,
  })
  hierarchyPath!: string[];

  /* ======================================================
   * PERMISSION OVERRIDES
   * ====================================================== */

  // Fine-grained permission overrides applied over role permissions
  @Prop({
    type: {
      allow: {
        type: [String],
        default: [],
      },
      deny: {
        type: [String],
        default: [],
      },
    },
    default: {
      allow: [],
      deny: [],
    },
  })
  permissionOverrides!: {
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
  status!: UserStatus;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);

// Useful indexes
EmployeeSchema.index({ employeeId: 1 }, { unique: true });
EmployeeSchema.index({ manNumber: 1 });
EmployeeSchema.index({ hierarchyPath: 1 });
