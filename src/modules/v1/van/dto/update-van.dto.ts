/**
 * Van Update DTO
 * --------------
 * Purpose : Update van master data
 * Used by : BACK_OFFICE / ADMIN
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, IsArray } from 'class-validator';

export class UpdateVanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vanNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  capacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  madeYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  associatedUsers?: string[];

  @ApiPropertyOptional({ example: 'ACTIVE' })
  @IsOptional()
  @IsString()
  status?: string;
}
