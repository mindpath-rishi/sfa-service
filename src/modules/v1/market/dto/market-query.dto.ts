/**
 * Market Query DTO
 * ----------------
 * Purpose : Filter and paginate markets
 * Used by : MARKET LISTING / ADMIN SCREENS
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumberString } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { MarketStatus } from 'src/shared/enums/market.enums';

export class MarketQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'MKT-001' })
  @IsOptional()
  @IsString()
  searchText?: string;

  @ApiPropertyOptional({ example: MarketStatus.ACTIVE, enum: MarketStatus })
  @IsOptional()
  @IsString()
  status?: string;
}
