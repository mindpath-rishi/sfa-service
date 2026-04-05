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
  userId: string;

  // Server-generated session identifier
  @Prop({ required: true, type: String })
  sessionId: string;

  // Stable client device identifier
  @Prop({ required: true, type: String})
  deviceId: string;

  /* ======================================================
   * DEVICE DETAILS
   * ====================================================== */

  // Device platform (web / android / ios)
  @Prop({ type: String})
  deviceType: string;

  // Operating system name
  @Prop({type: String})
  os: string;

  // Operating system version
  @Prop({type: String})
  osVersion: string;

  // Browser name/version (web clients)
  @Prop({type: String})
  browser: string;

  // Last known IP address
  @Prop({type: String})
  ipAddress: string;

  /* ======================================================
   * SESSION STATE
   * ====================================================== */

  // Indicates whether the session is currently active
  @Prop({ default: true, type: Boolean })
  isActive: boolean;

  // Timestamp of last successful login from this device
  @Prop({ type: Date})
  lastLoginAt: Date;

  // Push notification token (mobile clients)
  @Prop({ type: String})
  fcmToken?: string;
}

export const UserDeviceSchema = SchemaFactory.createForClass(UserDevice);
