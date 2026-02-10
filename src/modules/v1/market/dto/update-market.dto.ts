/**
 * Market Update DTO
 * ----------------
 * Purpose : Update existing market
 * Used by : BACK_OFFICE / ADMIN
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { MarketStatus } from 'src/shared/enums/market.enums';

export class UpdateMarketDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: MarketStatus.ACTIVE, enum: MarketStatus })
  @IsOptional()
  @IsString()
  status?: string;
}
