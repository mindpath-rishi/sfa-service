import { MarketStatus } from 'src/shared/enums/market.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';

export class CreateMarketDto {
/**
 * Market Create DTO
 * ====================
 * Data Transfer Object for creating new Market records
 */
  /**
   * Name
   * ----
   * Display name of market
   */

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string;
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
