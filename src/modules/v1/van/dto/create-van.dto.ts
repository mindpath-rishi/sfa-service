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
import { IsString, IsNumber, IsOptional, IsArray } from 'class-validator';

export class CreateVanDto {
  /**
   * Van ID
   * ------
   * Purpose : Unique business identifier for van
   * Example : VID-001
   */
  @ApiProperty({ example: 'VID-001' })
  @IsString()
  vanId: string;

  /**
   * Van Name
   * --------
   * Purpose : Display name of van
   * Example : Delivery Van 1
   */
  @ApiProperty({ example: 'Delivery Van 1' })
  @IsString()
  name: string;

  /**
   * Van Number
   * ----------
   * Purpose : Vehicle registration number
   * Example : KA01AB1234
   */
  @ApiProperty({ example: 'KA01AB1234' })
  @IsString()
  vanNumber: string;

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
    example: [{ userId: 'EID-001' }],
    required: false,
  })
  @IsOptional()
  @IsArray()
  associatedUsers?: string[];
}
