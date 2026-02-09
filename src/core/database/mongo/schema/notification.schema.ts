/**
 * Notifications Collection
 * ------------------------
 * Purpose : Store in-app notifications and push delivery status
 * Used by : WEB / MOBILE / BACK_OFFICE
 *
 * Contains:
 * - Notification content
 * - Receiver reference
 * - Push delivery tracking
 * - Read / unread state
 * - Platform & category info
 *
 * Notes:
 * - Push delivery is handled via FCM
 * - Database acts as source of truth for notification inbox
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  NotificationDeliveryStatus,
  NotificationPlatform,
} from 'src/shared/constants/notification.constants';

@Schema()
export class Notification {
  /* ======================================================
   * RECEIVER
   * ====================================================== */


  // User who receives this notification
  @Prop({ required: true, index: true })
  recipientId: string;

  /* ======================================================
   * CONTENT
   * ====================================================== */

  // Notification title
  @Prop({ required: true, trim: true })
  title: string;

  // Notification body/message
  @Prop({ required: true, trim: true })
  body: string;

  // Custom payload (orderId, routeId, etc.)
  @Prop({ type: Object, default: {} })
  data: Record<string, any>;

  /* ======================================================
   * DELIVERY
   * ====================================================== */

  // Push delivery status
  @Prop({
    type: String,
    enum: NotificationDeliveryStatus,
    default: NotificationDeliveryStatus.PENDING,
    index: true,
  })
  deliveryStatus: NotificationDeliveryStatus;

  // Error message if push failed
  @Prop()
  deliveryError?: string;

  // Timestamp when push was sent
  @Prop()
  sentAt?: Date;

  /* ======================================================
   * INBOX STATE
   * ====================================================== */

  // Whether user has read this notification
  @Prop({ default: false, index: true })
  isRead: boolean;

  // Timestamp when notification was read
  @Prop()
  readAt?: Date;

  /* ======================================================
   * METADATA
   * ====================================================== */

  // Platform (web / android / ios)
  @Prop({
    type: String,
    enum: NotificationPlatform,
    index: true,
  })
  platform?: NotificationPlatform;

  // Category/type (order, payment, system, etc.)
  @Prop({ index: true })
  category?: string;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

/* ======================================================
 * INDEXES
 * ====================================================== */

NotificationSchema.index({ recipientId: 1, createdAt: -1 });
NotificationSchema.index({ recipientId: 1, isRead: 1 });

