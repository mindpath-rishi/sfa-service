/**
 * Notification Service
 * --------------------
 * Purpose : Handles business logic for notification lifecycle management
 * Used by : NotificationController
 *
 * Responsibilities:
 * - Create notifications and trigger push delivery
 * - Fetch notification inbox with filters and pagination
 * - Retrieve single notification details
 * - Mark notifications as read
 * - Soft-delete notifications
 *
 * Notes:
 * - Database acts as source of truth for inbox
 * - Push delivery status is tracked per notification
 * - Soft deletes preserve audit history
 */

import { Injectable, NotFoundException, HttpStatus } from '@nestjs/common';
import { HydratedDocument, Model } from 'mongoose';
import { ObjectId } from 'mongodb';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';

import {
  Notification,
  NotificationSchema,
} from 'src/core/database/mongo/schema/notification.schema';

import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationQueryDto } from './dto/notification.query.dto';
import { NotificationDeliveryStatus } from 'src/shared/enums/notification.enums';
import { NOTIFICATION } from './notification.constants';
import {
  UserDevice,
  UserDeviceSchema,
} from 'src/core/database/mongo/schema/device.schema';
import { NotificationsService } from 'src/shared/notifications/notifications.service';
import { AppLogger } from 'src/core/logger/app-logger';
import { response } from 'express';

@Injectable()
export class NotificationService extends MongoRepository<Notification> {
  private readonly deviceModel: Model<UserDevice>;

  constructor(
    mongo: MongoService,
    private readonly pushService: NotificationsService,
  ) {
    super(mongo.getModel(Notification.name, NotificationSchema));

    // Device model for push token lookup
    this.deviceModel = mongo.getModel(UserDevice.name, UserDeviceSchema);
  }

  /**
   * Create Notification
   * -------------------
   * Purpose : Persist notification and trigger push delivery
   *
   * Flow:
   * - Save notification (pending)
   * - Fetch active device tokens
   * - Send push to all devices
   * - Update delivery status
   */
  async create(payload: CreateNotificationDto) {
    const notification = await this.save({
      recipientId: payload.recipientId,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      platform: payload.platform,
      category: payload.category,
      deliveryStatus: NotificationDeliveryStatus.PENDING,
    });


    try {
      // Fetch active devices with push tokens
      const devices = await this.deviceModel.find({
        userId: payload.recipientId,
        isActive: true,
        fcmToken: { $exists: true, $ne: null },
      });

      const tokens: string[] = devices
        .map((d) => d.fcmToken)
        .filter((token): token is string => Boolean(token));

      if (tokens.length) {
        const response: any = await this.pushService.sendToMultiple(
          tokens,
          payload.title,
          payload.body,
        );
        console.log('Push notification response:', response);
      }

      await this.updateById(notification._id.toString(), {
        deliveryStatus: NotificationDeliveryStatus.SENT,
        sentAt: new Date(),
      });
    } catch (error) {
      await this.updateById(notification._id.toString(), {
        deliveryStatus: NotificationDeliveryStatus.FAILED,
        deliveryError: error.message,
      });
    }

    return {
      statusCode: HttpStatus.CREATED,
      message: NOTIFICATION.CREATED,
      data: notification,
    };
  }

  /**
   * Get Notifications (Inbox)
   * -------------------------
   * Purpose : Retrieve notifications with filtering and pagination
   */
  async findAll(query: NotificationQueryDto) {
    const { deliveryStatus, isRead, platform, page = 1, limit = 20 } = query;

    const filter: Record<string, any> = {
      isDeleted: false,
    };

    if (deliveryStatus) filter.deliveryStatus = deliveryStatus;
    if (isRead !== undefined) filter.isRead = isRead;
    if (platform) filter.platform = platform;

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
    });

    return {
      statusCode: HttpStatus.OK,
      message: NOTIFICATION.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  /**
   * Get Notification by ID
   * ----------------------
   * Purpose : Retrieve a single notification
   */
  async findNotificationById(_id: string) {
    const notification = await super.findById(_id);

    if (!notification) {
      throw new NotFoundException(NOTIFICATION.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: NOTIFICATION.FETCHED,
      data: notification,
    };
  }

  /**
   * Mark Notification as Read
   * ------------------------
   * Purpose : Update inbox read state
   */
  async markAsRead(notificationId: string) {
    const updated = await this.updateById(notificationId, {
      isRead: true,
      readAt: new Date(),
    });

    if (!updated) {
      throw new NotFoundException(NOTIFICATION.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: NOTIFICATION.READ,
    };
  }

  /**
   * Delete Notification (Soft Delete)
   * --------------------------------
   * Purpose : Soft delete notification from inbox
   */
  async delete(notificationId: string) {
    const deleted = await this.softDelete({
      _id: new ObjectId(notificationId),
    });

    if (!deleted) {
      throw new NotFoundException(NOTIFICATION.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: NOTIFICATION.DELETED,
    };
  }
}
