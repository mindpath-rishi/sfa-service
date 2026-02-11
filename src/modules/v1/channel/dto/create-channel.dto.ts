import { ChannelStatus } from 'src/shared/enums/channel.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';

export class CreateChannelDto {
/**
 * Channel Create DTO
 * ====================
 * Data Transfer Object for creating new Channel records
 */
  /**
   * Name
   * ----
   * Display name of channel
   */

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string;
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
