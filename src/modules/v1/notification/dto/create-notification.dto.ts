/**
 * Create Notification DTO
 * ----------------------
 * Purpose : Validate payload for creating notifications
 * Used by : SYSTEM EVENTS / ADMIN FLOWS
 *
 * Contains:
 * - Recipient reference
 * - Notification content
 * - Optional metadata (platform, category, custom data)
 */

import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { NotificationPlatform } from 'src/shared/enums/notification.enums';

export class CreateNotificationDto {
  /* ======================================================
   * RECEIVER
   * ====================================================== */

  // Target recipient identifier (user / employee / admin)
  @ApiProperty({ example: 'USR-123' })
  @IsString()
  @IsNotEmpty()
  recipientId: string;

  /* ======================================================
   * CONTENT
   * ====================================================== */

  // Notification title
  @ApiProperty({ example: 'Order Created' })
  @IsString()
  @IsNotEmpty()
  title: string;

  // Notification body/message
  @ApiProperty({ example: 'Your order has been placed' })
  @IsString()
  @IsNotEmpty()
  body: string;

  // Custom payload (orderId, routeId, etc.)
  @ApiProperty({
    example: { orderId: 'ORD-001' },
    required: false,
  })
  @IsOptional()
  @IsObject()
  data?: Record<string, any>;

  /* ======================================================
   * METADATA
   * ====================================================== */

  // Target platform
  @ApiProperty({
    enum: NotificationPlatform,
    required: false,
  })
  @IsOptional()
  @IsEnum(NotificationPlatform)
  platform?: NotificationPlatform;

  // Notification category/type (order, payment, system)
  @ApiProperty({
    example: 'order',
    required: false,
  })
  @IsOptional()
  @IsString()
  category?: string;
}
