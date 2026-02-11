import { ChannelStatus } from 'src/shared/enums/channel.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';

export class UpdateChannelDto {
/**
 * Channel Update DTO
 * ====================
 * Data Transfer Object for updating Channel records
 * 
 * All fields are optional for partial updates
 */
  /**
   * Name
   * ----
   * Display name of channel
   */

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;
  /**
   * Status
   * ------
   * Channel availability status
   */

  @ApiPropertyOptional({ example: ChannelStatus.ACTIVE, enum: ChannelStatus })
  @IsOptional()
  @IsEnum(ChannelStatus)
  status?: ChannelStatus;

}
