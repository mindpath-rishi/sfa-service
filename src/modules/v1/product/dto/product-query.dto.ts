/**
 * Product Query DTO
 * -----------------
 * Purpose : Filter and paginate product records
 * Used by : PRODUCT LISTING / ADMIN SCREENS
 *
 * Supports:
 * - Name search
 * - Category filtering
 * - Status filtering
 * - Pagination
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumberString } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

export class ProductQueryDto extends PaginationDto {
  /**
   * Search Text
   * -----------
   * Purpose : Search by product name or code
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  searchText?: string;

  /**
   * Category ID
   * -----------
   * Purpose : Filter by product category
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  /**
   * Status
   * ------
   * Purpose : Filter active or inactive products
   */
  @ApiPropertyOptional({ example: 'ACTIVE' })
  @IsOptional()
  @IsString()
  status?: string;
}
