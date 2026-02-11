import { ChannelStatus } from 'src/shared/enums/channel.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * Channel Query DTO
 * ===================
 * Data Transfer Object for querying Channel records
 * 
 * Extends PaginationDto for pagination support
 */
export class ChannelQueryDto extends PaginationDto {
  /**
   * SearchText
   * ----------
   * Search by name, code, or identifier
   */

  @ApiPropertyOptional({ description: "Search by name, code, or identifier" })
  @IsOptional()
  @IsString()
  searchText?: string;
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
