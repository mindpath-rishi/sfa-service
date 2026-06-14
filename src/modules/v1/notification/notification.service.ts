/**
 * Notification Service
 * --------------------
 * Purpose : Handles business logic for notification lifecycle management
 */

import { Injectable, NotFoundException, HttpStatus } from '@nestjs/common';
import { HydratedDocument, Model, Types } from 'mongoose';

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
import { RequestContextStore } from 'src/core/context/request-context';

@Injectable()
export class NotificationService extends MongoRepository<Notification> {
  private readonly deviceModel: Model<UserDevice>;

  constructor(
    mongo: MongoService,
    private readonly pushService: NotificationsService,
  ) {
    super(mongo.getModel(Notification.name, NotificationSchema));

    this.deviceModel = mongo.getModel(UserDevice.name, UserDeviceSchema);
  }

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
      const devices = await this.deviceModel.find({
        userId: payload.recipientId,
        isActive: true,
        fcmToken: { $exists: true, $ne: null },
      });
      const tokens: string[] = devices
        .map((d) => d.fcmToken)
        .filter((token): token is string => Boolean(token));

      if (!tokens.length) {
        await this.updateById(notification._id.toString(), {
          deliveryStatus: NotificationDeliveryStatus.FAILED,
          deliveryError: 'No active device push tokens found',
        });

        return {
          statusCode: HttpStatus.CREATED,
          message: NOTIFICATION.CREATED,
          data: notification,
        };
      }

      const response = await this.pushService.sendToMultiple(
        tokens,
        payload.title,
        payload.body,
        {
          ...payload.data,
          notificationId: notification._id.toString(),
          route: payload.data?.route ?? '/notifications',
        },
      );

      if (response.failed > 0 && response.success === 0) {
        await this.updateById(notification._id.toString(), {
          deliveryStatus: NotificationDeliveryStatus.FAILED,
          deliveryError: response.results
            ?.filter((result) => !result.success)
            .map((result) => result.error)
            .filter(Boolean)
            .join('; '),
        });

        return {
          statusCode: HttpStatus.CREATED,
          message: NOTIFICATION.CREATED,
          data: notification,
        };
      }

      await this.updateById(notification._id.toString(), {
        deliveryStatus: NotificationDeliveryStatus.SENT,
        sentAt: new Date(),
      });
    } catch (error: any) {
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

  async findAll(query: NotificationQueryDto) {
    const { deliveryStatus, isRead, platform, page = 1, limit = 20 } = query;
    const userId = RequestContextStore.getStore()?.userId;

    const filter: Record<string, any> = {
      isDeleted: false,
    };

    if (userId) filter.recipientId = userId;
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

  async markVanChangeRequestResolved(
    workSessionId: string,
    status: 'APPROVED' | 'REJECTED' | 'CANCELLED',
  ) {
    await this.updateOne(
      {
        category: 'van_change',
        'data.workSessionId': workSessionId,
        'data.action': 'APPROVAL_REQUIRED',
      } as any,
      {
        $set: {
          isRead: true,
          readAt: new Date(),
          'data.vanChangeStatus': status,
          'data.status': status,
          'data.resolvedAt': new Date(),
        },
      } as any,
    );
  }

  async delete(notificationId: string) {
    // ✅ Validate ObjectId before using
    if (!Types.ObjectId.isValid(notificationId)) {
      throw new NotFoundException('Invalid notification ID');
    }

    const deleted = await this.softDelete({
      // ✅ Correct ObjectId usage
      _id: new Types.ObjectId(notificationId),
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
