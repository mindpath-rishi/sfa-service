/**
 * Users Collection
 * ----------------
 * Purpose : Authentication & Authorization only
 * Used by : ECOMMERCE, BACK_OFFICE
 *
 * Contains:
 * - Login credentials
 * - Agent context
 * - Account status
 * - Login metadata
 *
 * Notes:
 * - Profile data is stored separately (Customer / Employee)
 * - Timestamps are added via global mongoose plugin
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Agent, UserStatus } from 'src/modules/v1/user/user.enum';

@Schema({
  collection: 'users',
})
export class User {
  /* ======================================================
   * IDENTITY
   * ====================================================== */

  // customerId OR employeeId
  @Prop({
    type: String,
    required: true,
    unique: true,
    index: true,
  })
  profileId: string;

  /* ======================================================
   * LOGIN CREDENTIALS
   * ====================================================== */

  // Unique PER AGENT (composite index below)
  @Prop({
    type: String,
    required: true,
    trim: true,
    index: true,
  })
  loginId: string;

  // Unique PER AGENT (composite index below)
  @Prop({
    type: String,
    required: true,
    index: true,
  })
  mobile: string;

  // Optional, unique PER AGENT (composite index below)
  @Prop({
    type: String,
    lowercase: true,
    trim: true,
    sparse: true,
    index: true,
  })
  email?: string;

  @Prop({
    type: String,
    required: true,
    select: false,
  })
  password: string;

  /* ======================================================
   * STATUS & METADATA
   * ====================================================== */

  @Prop({
    type: String,
    enum: UserStatus,
    default: UserStatus.ACTIVE,
    index: true,
  })
  status: UserStatus;

  @Prop()
  lastLoginAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

/* ======================================================
 * COMPOSITE UNIQUE INDEXES (CRITICAL)
 * ====================================================== */

// 🔐 Same loginId cannot exist twice within same agent
UserSchema.index(
  { loginId: 1, agent: 1 },
  { unique: true },
);

// 🔐 Same mobile cannot exist twice within same agent
UserSchema.index(
  { mobile: 1, agent: 1 },
  { unique: true, sparse: true },
);

// 🔐 Same email cannot exist twice within same agent
UserSchema.index(
  { email: 1, agent: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $exists: true } },
    sparse: true,
  },
);


