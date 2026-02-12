import { OutletTypeStatus } from 'src/shared/enums/outlet-type.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';

export class CreateOutletTypeDto {
/**
 * OutletType Create DTO
 * ====================
 * Data Transfer Object for creating new OutletType records
 */
  /**
   * Name
   * ----
   * Display name of outlet type
   */

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string;
  /**
   * Status
   * ------
   * Outlet type availability status
   */

  @ApiPropertyOptional({ example: OutletTypeStatus.ACTIVE, enum: OutletTypeStatus })
  @IsOptional()
  @IsEnum(OutletTypeStatus)
  status?: OutletTypeStatus;

}
