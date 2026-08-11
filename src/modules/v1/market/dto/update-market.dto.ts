import { MarketStatus } from 'src/shared/enums/market.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';

export class UpdateMarketDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  provinceId?: string;
/**
 * Market Update DTO
 * ====================
 * Data Transfer Object for updating Market records
 * 
 * All fields are optional for partial updates
 */
  /**
   * Name
   * ----
   * Display name of market
   */

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;
  /**
   * Status
   * ------
   * Market availability status
   */

  @ApiPropertyOptional({ example: MarketStatus.ACTIVE, enum: MarketStatus })
  @IsOptional()
  @IsEnum(MarketStatus)
  status?: MarketStatus;

}
