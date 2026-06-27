/**
 * Van Create DTO
 * --------------
 * Purpose : Create new van master record
 * Used by : BACK_OFFICE / ADMIN
 *
 * Supports:
 * - Van identity
 * - Capacity and manufacture year
 * - User associations
 */

import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsEnum,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VanStatus } from 'src/shared/enums/van.enums';

export class VanRouteDto {
  @ApiProperty({ example: 'ROUTE-001' })
  @IsString()
  routeId!: string;

  @ApiProperty({ example: 'MONDAY', required: false })
  @IsOptional()
  @IsString()
  day?: string;

  @ApiProperty({ example: '2026-06-01' })
  @IsDateString()
  fromDate!: string;

  @ApiProperty({ example: '2026-06-30' })
  @IsDateString()
  toDate!: string;
}

export class CreateVanDto {
  /**
   * Van ID
   * ------
   * Purpose : Unique business identifier for van
   * Example : VID-001
   */
  @ApiProperty({ example: 'VID-001' })
  @IsString()
  vanId!: string;

  /**
   * Van Name
   * --------
   * Purpose : Display name of van
   * Example : Delivery Van 1
   */
  @ApiProperty({ example: 'Delivery Van 1' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'Ramesh' })
  @IsString()
  driverName!: string;

  /**
   * Van Number
   * ----------
   * Purpose : Vehicle registration number
   * Example : KA01AB1234
   */
  @ApiProperty({ example: 'KA01AB1234' })
  @IsString()
  vanNumber!: string;

  /**
   * Capacity
   * --------
   * Purpose : Load capacity
   * Example : 1000
   */
  @ApiProperty({ example: 1000, required: false })
  @IsOptional()
  @IsNumber()
  capacity?: number;

  /**
   * Made Year
   * ---------
   * Purpose : Manufacturing year
   * Example : 2022
   */
  @ApiProperty({ example: 2022, required: false })
  @IsOptional()
  @IsNumber()
  madeYear?: number;

  /**
   * Associated Users
   * ----------------
   * Purpose : Users assigned to van
   * Example : [{ "userId": "EID-001" }]
   */
  @ApiProperty({
    example: ['EID-001'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  associatedUsers?: string[];

  @ApiProperty({
    type: [VanRouteDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VanRouteDto)
  associatedRoutes?: VanRouteDto[];

  @ApiProperty({ example: VanStatus.ACTIVE, enum: VanStatus, required: false })
  @IsOptional()
  @IsEnum(VanStatus)
  status?: VanStatus;
}
