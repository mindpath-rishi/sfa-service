import { CustomerCategoryStatus } from 'src/shared/enums/customer-category.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * CustomerCategory Query DTO
 * ===================
 * Data Transfer Object for querying CustomerCategory records
 * 
 * Extends PaginationDto for pagination support
 */
export class CustomerCategoryQueryDto extends PaginationDto {
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
   * Display name of customer category
   */

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;
  /**
   * Status
   * ------
   * Customer category availability status
   */

  @ApiPropertyOptional({ example: CustomerCategoryStatus.ACTIVE, enum: CustomerCategoryStatus })
  @IsOptional()
  @IsEnum(CustomerCategoryStatus)
  status?: CustomerCategoryStatus;
}
