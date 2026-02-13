/**
 * Notification Controller
 * -----------------------
 * Purpose : Exposes APIs for managing notification inbox and push lifecycle
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create notifications
 * - Fetch notifications with filters & pagination
 * - Retrieve individual notification details
 * - Mark notifications as read
 * - Soft delete notifications
 *
 * Notes:
 * - Push delivery is handled separately via NotificationsService
 * - Database acts as source of truth for inbox
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { CreateNotificationDto } from './dto/create-notification.dto';

import { FeatureFlag } from 'src/core/decorators/feature-flag.decorator';
import { ApiSuccessResponse } from 'src/core/swagger/api.response.swagger';
import {
  ApiInternalErrorResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from 'src/core/swagger/api-error.response.swagger';

import {
  API_MODULE,
  API_MODULE_ENABLE_KEYS,
  V1,
} from 'src/shared/constants/api.constants';

import { Permissions } from 'src/core/decorators/permission.decorator';
import { NOTIFICATION } from './notification.constants';
import { NotificationQueryDto } from './dto/notification.query.dto';
import { NotificationService } from './notification.service';
import { Public } from 'src/core/decorators/public.decorator';

@ApiTags('Notification')
@FeatureFlag(API_MODULE_ENABLE_KEYS.NOTIFICATION)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.NOTIFICATION,
  version: V1,
})
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Create Notification
   * -------------------
   * Purpose : Create notification and trigger push delivery
   * Used by : SYSTEM EVENTS / ADMIN FLOWS
   */
  @Permissions('NOTIFICATION_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create notification' })
  @ApiBody({ type: CreateNotificationDto })
  @ApiSuccessResponse(
    {
      recipientId: 'USR-123',
      title: 'Order Created',
      body: 'Your order has been placed',
    },
    NOTIFICATION.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateNotificationDto) {
    return this.notificationService.create(dto);
  }

  /**
   * Get Notifications
   * -----------------
   * Purpose : Retrieve paginated notification inbox
   * Used by : USER INBOX / ADMIN SCREENS
   *
   * Supports:
   * - Read/unread filtering
   * - Delivery status filtering
   * - Pagination
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get notifications' })
  @ApiSuccessResponse(
    {
      items: [
        {
          title: 'Order Created',
          body: 'Your order has been placed',
          isRead: false,
        },
      ],
      meta: {
        total: 10,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    },
    NOTIFICATION.FETCHED,
  )
  async findAll(@Query() query: NotificationQueryDto) {
    return this.notificationService.findAll(query);
  }

  /**
   * Get Notification by ID
   * ----------------------
   * Purpose : Retrieve single notification
   * Used by : NOTIFICATION DETAIL VIEW
   */
  @Get(':notificationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get notification by id' })
  @ApiParam({ name: 'notificationId' })
  @ApiSuccessResponse(
    {
      title: 'Order Created',
      body: 'Your order has been placed',
    },
    NOTIFICATION.FETCHED,
  )
  @ApiNotFoundResponse()
  async findOne(@Param('notificationId') notificationId: string) {
    return this.notificationService.findNotificationById(notificationId);
  }

  /**
   * Mark Notification as Read
   * ------------------------
   * Purpose : Update inbox state
   * Used by : MOBILE / WEB CLIENTS
   */
  @Patch(':notificationId/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiParam({ name: 'notificationId' })
  @ApiSuccessResponse(null, NOTIFICATION.READ)
  @ApiNotFoundResponse()
  async markRead(@Param('notificationId') notificationId: string) {
    return this.notificationService.markAsRead(notificationId);
  }

  /**
   * Delete Notification
   * -------------------
   * Purpose : Soft delete notification
   * Used by : USER / ADMIN FLOWS
   */
  @Delete(':notificationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete notification' })
  @ApiParam({ name: 'notificationId' })
  @ApiSuccessResponse(null, NOTIFICATION.DELETED)
  @ApiNotFoundResponse()
  async delete(@Param('notificationId') notificationId: string) {
    return this.notificationService.delete(notificationId);
  }
}
