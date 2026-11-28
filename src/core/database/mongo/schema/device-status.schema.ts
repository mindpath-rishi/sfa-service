/**
 * Device status (one document per user)
 * -------------------------------------
 * Latest heartbeat from the mobile app: battery %, last active time and
 * network state, so managers / TLs / admins can see field users' devices.
 * Offline periods are kept in `user_offline_logs` (see OfflineLog).
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true, collection: 'user_device_status' })
export class DeviceStatus {
  @Prop({ required: true, unique: true, index: true, type: String })
  userId!: string;

  @Prop({ type: String })
  userName?: string;

  /** 0-100, null when the device does not report it */
  @Prop({ type: Number, default: null })
  batteryLevel?: number | null;

  @Prop({ type: Boolean, default: false })
  isCharging?: boolean;

  // Last location point or stationary ping received (also while the app is closed)
  @Prop({ type: Date })
  lastLocationAt?: Date;

  /** Last time the app was in use (heartbeat received or user activity) */
  @Prop({ type: Date, index: true })
  lastActiveAt?: Date;

  @Prop({ type: String, enum: ['ONLINE', 'OFFLINE'], default: 'ONLINE' })
  networkStatus?: 'ONLINE' | 'OFFLINE';

  @Prop({ type: Date })
  lastOfflineAt?: Date;

  @Prop({ type: Date })
  lastOnlineAt?: Date;

  /** Total offline minutes captured today (calendar day of lastActiveAt) */
  @Prop({ type: Number, default: 0 })
  offlineMinutesToday?: number;

  @Prop({ type: String })
  offlineDay?: string;

  @Prop({ type: String })
  workSessionId?: string;

  @Prop({ type: String })
  appVersion?: string;

  /** Phone settings background tracking depends on (reported by the app) */
  @Prop({ type: Object, default: null })
  trackingHealth?: TrackingHealth | null;
}

export type TrackingHealth = {
  backgroundLocation?: boolean;
  /** null on phones without battery optimization (iOS) */
  batteryUnrestricted?: boolean | null;
  autostartConfirmed?: boolean;
  reportedAt?: Date;
};

export const DeviceStatusSchema = SchemaFactory.createForClass(DeviceStatus);

@Schema({ timestamps: true, collection: 'user_offline_logs' })
export class OfflineLog {
  @Prop({ required: true, index: true, type: String })
  userId!: string;

  @Prop({ type: String })
  workSessionId?: string;

  @Prop({ required: true, type: Date, index: true })
  offlineFrom!: Date;

  @Prop({ required: true, type: Date })
  offlineTo!: Date;

  @Prop({ required: true, type: Number })
  durationMinutes!: number;
}

export const OfflineLogSchema = SchemaFactory.createForClass(OfflineLog);
OfflineLogSchema.index({ userId: 1, offlineFrom: 1 }, { unique: true });
