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
import {
  NotificationDeliveryStatus,
  NotificationPlatform,
} from 'src/shared/enums/notification.enums';
import { NOTIFICATION } from './notification.constants';
import {
  UserDevice,
  UserDeviceSchema,
} from 'src/core/database/mongo/schema/device.schema';
import { NotificationsService } from 'src/shared/notifications/notifications.service';
import { RequestContextStore } from 'src/core/context/request-context';
import {
  Employee,
  EmployeeSchema,
} from 'src/core/database/mongo/schema/employee.schema';
import { UserStatus } from '../user/user.enum';

@Injectable()
export class NotificationService extends MongoRepository<Notification> {
  private readonly deviceModel: Model<UserDevice>;
  private readonly employeeModel: Model<Employee>;

  constructor(
    mongo: MongoService,
    private readonly pushService: NotificationsService,
  ) {
    super(mongo.getModel(Notification.name, NotificationSchema));

    this.deviceModel = mongo.getModel(UserDevice.name, UserDeviceSchema);
    this.employeeModel = mongo.getModel(Employee.name, EmployeeSchema);
  }

  async create(payload: CreateNotificationDto) {
    const recipientIds = payload.sendToAll
      ? await this.employeeModel.distinct('employeeId', {
          status: UserStatus.ACTIVE,
          isDeleted: { $ne: true },
        })
      : payload.recipientId
        ? [payload.recipientId]
        : [];
    const platforms = payload.platforms?.length
      ? payload.platforms
      : payload.platform
        ? [payload.platform]
        : [];
    const notifications: any[] = [];

    for (const recipientId of recipientIds) {
      notifications.push(
        await this.createForRecipient(payload, recipientId, platforms),
      );
    }

    return {
      statusCode: HttpStatus.CREATED,
      message: NOTIFICATION.CREATED,
      data: {
        totalRecipients: recipientIds.length,
        notifications,
      },
    };
  }

  private async createForRecipient(
    payload: CreateNotificationDto,
    recipientId: string,
    platforms: NotificationPlatform[],
  ) {
    const notification = await this.save({
      recipientId,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      platform: payload.platform,
      platforms,
      category: payload.category,
      deliveryStatus: NotificationDeliveryStatus.PENDING,
    });

    try {
      const devices = await this.deviceModel.find({
        userId: recipientId,
        isActive: true,
        fcmToken: { $exists: true, $ne: null },
        ...(platforms.length ? { deviceType: { $in: platforms } } : {}),
      });
      const tokens: string[] = devices
        .map((d) => d.fcmToken)
        .filter((token): token is string => Boolean(token));

      if (!tokens.length) {
        await this.updateById(notification._id.toString(), {
          deliveryStatus: NotificationDeliveryStatus.FAILED,
          deliveryError: 'No active device push tokens found',
        });

        return notification;
      }

      const response = await this.pushService.sendToMultiple(
        tokens,
        payload.title,
        payload.body,
        {
          ...payload.data,
          notificationId: notification._id.toString(),
          route: payload.data?.route ?? '/notifications',
          openAsModal: true,
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

        return notification;
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

    return notification;
  }

  async findAll(query: NotificationQueryDto) {
    const {
      deliveryStatus,
      isRead,
      platform,
      searchText,
      category,
      page = 1,
      limit = 20,
    } = query;
    const userId = RequestContextStore.getStore()?.userId;

    const filter: Record<string, any> = {
      isDeleted: false,
    };

    if (userId) filter.recipientId = userId;
    if (deliveryStatus) filter.deliveryStatus = deliveryStatus;
    if (isRead !== undefined) filter.isRead = isRead;
    if (platform) filter.$or = [{ platform }, { platforms: platform }];
    if (category) filter.category = category;
    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ title: regex }, { body: regex }, { category: regex }];
    }

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
    const userId = RequestContextStore.getStore()?.userId;
    const notification = await this.findOne({
      _id,
      ...(userId ? { recipientId: userId } : {}),
    } as any);

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
    const userId = RequestContextStore.getStore()?.userId;
    const existing = await this.findOne({
      _id: notificationId,
      ...(userId ? { recipientId: userId } : {}),
    } as any);
    if (!existing) throw new NotFoundException(NOTIFICATION.NOT_FOUND);
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

  async getUnreadCount() {
    const userId = RequestContextStore.getStore()?.userId;
    const count = await this.countDocuments({
      isRead: false,
      ...(userId ? { recipientId: userId } : {}),
    } as any);
    return {
      statusCode: HttpStatus.OK,
      message: NOTIFICATION.FETCHED,
      data: { count },
    };
  }

  async markAllAsRead() {
    const userId = RequestContextStore.getStore()?.userId;
    const filter = {
      isRead: false,
      ...(userId ? { recipientId: userId } : {}),
    } as any;
    const result = await this.model.updateMany(filter, {
      $set: { isRead: true, readAt: new Date() },
    });
    return {
      statusCode: HttpStatus.OK,
      message: NOTIFICATION.READ,
      data: { updated: result.modifiedCount },
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

  async markOutletApprovalResolved(customerId: string, status: string) {
    await this.updateOne(
      { category: 'outlet_approval', 'data.customerId': customerId } as any,
      {
        $set: {
          isRead: true,
          readAt: new Date(),
          'data.status': status,
          'data.action': status,
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

    const userId = RequestContextStore.getStore()?.userId;
    const deleted = await this.softDelete({
      // ✅ Correct ObjectId usage
      _id: new Types.ObjectId(notificationId),
      ...(userId ? { recipientId: userId } : {}),
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
