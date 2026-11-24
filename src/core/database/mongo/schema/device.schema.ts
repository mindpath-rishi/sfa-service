/**
 * User Devices Collection
 * ----------------------
 * Purpose : Track user sessions and device-level authentication
 * Used by : AUTH / SECURITY / SESSION MANAGEMENT
 *
 * Contains:
 * - User-session-device mapping
 * - Device and platform metadata
 * - Session activity status
 *
 * Notes:
 * - One user can have multiple active devices
 * - Sessions are invalidated by device on logout
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true, collection: 'user_devices' })
export class UserDevice {
  /* ======================================================
   * IDENTIFIERS
   * ====================================================== */

  // Business user identifier (profileId)
  @Prop({ required: true, index: true, type: String })
  userId!: string;

  // Server-generated session identifier
  @Prop({ required: true, type: String })
  sessionId!: string;

  // Stable client device identifier
  @Prop({ required: true, type: String })
  deviceId!: string;

  /* ======================================================
   * DEVICE DETAILS
   * ====================================================== */

  // Device platform (web / android / ios)
  @Prop({ type: String })
  deviceType!: string;

  // Operating system name
  @Prop({ type: String })
  os!: string;

  // Operating system version
  @Prop({ type: String })
  osVersion!: string;

  // Browser name/version (web clients)
  @Prop({ type: String })
  browser!: string;

  // Last known IP address
  @Prop({ type: String })
  ipAddress!: string;

  /* ======================================================
   * SESSION STATE
   * ====================================================== */

  // Indicates whether the session is currently active
  @Prop({ default: true, type: Boolean })
  isActive!: boolean;

  // Timestamp of last successful login from this device
  @Prop({ type: Date })
  lastLoginAt!: Date;

  // Push notification token (mobile clients)
  @Prop({ type: String})
  fcmToken?: string;

  /* ======================================================
   * DEVICE DETAILS (updated on every login)
   * ====================================================== */

  @Prop({ type: String }) appVersion?: string;
  @Prop({ type: String }) appBuildVersion?: string;
  @Prop({ type: String }) applicationId?: string;
  @Prop({ type: String }) brand?: string;
  @Prop({ type: String }) manufacturer?: string;
  @Prop({ type: String }) modelName?: string;
  @Prop({ type: String }) modelId?: string;
  @Prop({ type: String }) deviceName?: string;
  @Prop({ type: String }) osBuildId?: string;
  @Prop({ type: Number }) totalMemoryMb?: number;
  @Prop({ type: Boolean }) isPhysicalDevice?: boolean;
  @Prop({ type: Boolean }) isRooted?: boolean;
  @Prop({ type: String }) locale?: string;
  @Prop({ type: String }) timezone?: string;
  @Prop({ type: Number }) screenWidth?: number;
  @Prop({ type: Number }) screenHeight?: number;
  @Prop({ type: String }) networkType?: string;
  @Prop({ type: String }) userAgent?: string;

  @Prop({ type: Date }) firstLoginAt?: Date;
  @Prop({ type: Number, default: 0 }) loginCount?: number;
}

export const UserDeviceSchema = SchemaFactory.createForClass(UserDevice);
