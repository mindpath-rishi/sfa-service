import { ProvinceStatus } from 'src/shared/enums/province.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsBoolean } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * Province Query DTO
 * ===================
 * Data Transfer Object for querying Province records
 * 
 * Extends PaginationDto for pagination support
 */
export class ProvinceQueryDto extends PaginationDto {
  /**
   * SearchText
   * ----------
   * Search by name, code, or identifier
   */

  @ApiPropertyOptional({ description: "Search by name, code, or identifier" })
  @IsOptional()
  @IsString()
  searchText?: string;
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
