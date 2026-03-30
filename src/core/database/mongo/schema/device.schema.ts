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
  @Prop({ required: true, index: true })
  userId: string;

  // Server-generated session identifier
  @Prop({ required: true })
  sessionId: string;

  // Stable client device identifier
  @Prop({ required: true })
  deviceId: string;

  /* ======================================================
   * DEVICE DETAILS
   * ====================================================== */

  // Device platform (web / android / ios)
  @Prop()
  deviceType: string;

  // Operating system name
  @Prop()
  os: string;

  // Operating system version
  @Prop()
  osVersion: string;

  // Browser name/version (web clients)
  @Prop()
  browser: string;

  // Last known IP address
  @Prop()
  ipAddress: string;

  /* ======================================================
   * SESSION STATE
   * ====================================================== */

  // Indicates whether the session is currently active
  @Prop({ default: true })
  isActive: boolean;

  // Timestamp of last successful login from this device
  @Prop()
  lastLoginAt: Date;

  // Push notification token (mobile clients)
  @Prop()
  fcmToken?: string;
}

export const UserDeviceSchema = SchemaFactory.createForClass(UserDevice);
