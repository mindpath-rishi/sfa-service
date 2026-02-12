import { OutletTypeStatus } from 'src/shared/enums/outlet-type.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * OutletType Query DTO
 * ===================
 * Data Transfer Object for querying OutletType records
 * 
 * Extends PaginationDto for pagination support
 */
export class OutletTypeQueryDto extends PaginationDto {
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
