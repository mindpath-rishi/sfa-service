/**
 * Notification Query DTO
 * ----------------------
 * Purpose : Validate query params for notification inbox
 * Used by : WEB / MOBILE CLIENTS
 *
 * Supports:
 * - Pagination
 * - Delivery status filtering
 * - Read/unread filtering
 * - Platform filtering
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumberString, IsOptional } from 'class-validator';
import { NotificationDeliveryStatus, NotificationPlatform } from 'src/shared/enums/notification.enums';
import { PaginationDto } from 'src/shared/dto/pagination.dto';


export class NotificationQueryDto  extends PaginationDto{
 
  /* ======================================================
   * FILTERS
   * ====================================================== */

  // Push delivery status
  @ApiPropertyOptional({ enum: NotificationDeliveryStatus })
  @IsOptional()
  @IsEnum(NotificationDeliveryStatus)
  deliveryStatus?: NotificationDeliveryStatus;

  // Read / unread filter
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isRead?: boolean;

  // Platform filter
  @ApiPropertyOptional({ enum: NotificationPlatform })
  @IsOptional()
  @IsEnum(NotificationPlatform)
  platform?: NotificationPlatform;
}
