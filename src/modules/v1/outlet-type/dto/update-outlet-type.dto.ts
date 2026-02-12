import { OutletTypeStatus } from 'src/shared/enums/outlet-type.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';

export class UpdateOutletTypeDto {
/**
 * OutletType Update DTO
 * ====================
 * Data Transfer Object for updating OutletType records
 * 
 * All fields are optional for partial updates
 */
  /**
   * Name
   * ----
   * Display name of outlet type
   */

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;
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
