/**
 * Van Update DTO
 * --------------
 * Purpose : Update van master data
 * Used by : BACK_OFFICE / ADMIN
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  IsEnum,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VanStatus } from 'src/shared/enums/van.enums';

export class UpdateVanRouteDto {
  @ApiPropertyOptional({ example: 'ROUTE-001' })
  @IsString()
  routeId!: string;

  @ApiPropertyOptional({ example: 'MONDAY' })
  @IsOptional()
  @IsString()
  day?: string;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsDateString()
  fromDate!: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsDateString()
  toDate!: string;
}

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

  @ApiPropertyOptional({ example: 'Ramesh' })
  @IsOptional()
  @IsString()
  driverName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  madeYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  associatedUsers?: string[];

  @ApiPropertyOptional({ type: [UpdateVanRouteDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateVanRouteDto)
  associatedRoutes?: UpdateVanRouteDto[];

  @ApiPropertyOptional({ example: VanStatus.ACTIVE, enum: VanStatus })
  @IsOptional()
  @IsEnum(VanStatus)
  status?: VanStatus;
}
