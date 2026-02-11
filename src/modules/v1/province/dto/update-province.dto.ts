import { ProvinceStatus } from 'src/shared/enums/province.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsBoolean } from 'class-validator';

export class UpdateProvinceDto {
/**
 * Province Update DTO
 * ====================
 * Data Transfer Object for updating Province records
 * 
 * All fields are optional for partial updates
 */
  /**
   * CountryId
   * ---------
   * Reference of country
   */

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  countryId?: string;
  /**
   * Name
   * ----
   * Display name of province
   */

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;
  /**
   * Status
   * ------
   * Province availability status
   */

  @ApiPropertyOptional({ example: ProvinceStatus.ACTIVE, enum: ProvinceStatus })
  @IsOptional()
  @IsEnum(ProvinceStatus)
  status?: ProvinceStatus;
  /**
   * IsDeleted
   * ---------
   * Soft delete flag
   */

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDeleted?: boolean;

}
