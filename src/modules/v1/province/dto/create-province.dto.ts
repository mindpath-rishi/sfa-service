import { ProvinceStatus } from 'src/shared/enums/province.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';

export class CreateProvinceDto {
/**
 * Province Create DTO
 * ====================
 * Data Transfer Object for creating new Province records
 */
  /**
   * CountryId
   * ---------
   * Reference of country
   */

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  countryId: string;
  /**
   * Name
   * ----
   * Display name of province
   */

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string;
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
