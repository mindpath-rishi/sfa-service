/**
 * Market Create DTO
 * ----------------
 * Purpose : Create new market
 * Used by : BACK_OFFICE / ADMIN
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateMarketDto {
  @ApiProperty({ example: 'MKT-001' })
  @IsString()
  name: string;
}
