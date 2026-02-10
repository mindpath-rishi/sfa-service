import { CountryStatus } from 'src/shared/enums/country.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * Country Query DTO
 * ===================
 * Data Transfer Object for querying Country records
 * 
 * Extends PaginationDto for pagination support
 */
export class CountryQueryDto extends PaginationDto {
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
   * Name
   * ----
   * Display name of country
   */

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;
  /**
   * Status
   * ------
   * Country availability status
   */

  @ApiPropertyOptional({ example: CountryStatus.ACTIVE, enum: CountryStatus })
  @IsOptional()
  @IsEnum(CountryStatus)
  status?: CountryStatus;
}
