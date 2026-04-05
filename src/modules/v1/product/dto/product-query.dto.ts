/**
 * Product Query DTO
 * -----------------
 * Purpose : Filter and paginate product records
 * Used by : PRODUCT LISTING / ADMIN SCREENS
 *
 * Supports:
 * - Name/code/SKU search
 * - Multiple category filtering
 * - Multiple brand filtering
 * - Status filtering
 * - Pagination
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsArray, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { ProductStatus } from 'src/shared/enums/product.enums';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

export class ProductQueryDto extends PaginationDto {
  /**
   * Search Text
   * -----------
   * Purpose : Search by product name, code, or SKU
   */
  @ApiPropertyOptional({
    description: 'Search by product name, code, or SKU',
    example: 'iphone',
  })
  @IsOptional()
  @IsString()
  searchText?: string;

  /**
   * Category IDs
   * -------------
   * Purpose : Filter by multiple product categories
   * Format : Comma-separated string (e.g., "cat1,cat2,cat3")
   */
  @ApiPropertyOptional({
    description: 'Filter by multiple category IDs (comma-separated)',
    example: '507f1f77bcf86cd799439011,507f1f77bcf86cd799439012',
  })
  @IsOptional()
  @IsString()
  categoryIds?: string;

  /**
   * Brands
   * ------
   * Purpose : Filter by multiple brand names
   * Format : Comma-separated string (e.g., "Apple,Samsung,Google")
   */
  @ApiPropertyOptional({
    description: 'Filter by multiple brand names (comma-separated)',
    example: 'Apple,Samsung,Google',
  })
  @IsOptional()
  @IsString()
  brands?: string;

  /**
   * Status
   * ------
   * Purpose : Filter active or inactive products
   */
  @ApiPropertyOptional({
    description: 'Filter by product status',
    example: ProductStatus.ACTIVE,
    enum: ProductStatus,
  })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  /**
   * Min Price
   * ---------
   * Purpose : Filter products with minimum price
   */
  @ApiPropertyOptional({
    description: 'Minimum price filter',
    example: '100',
  })
  @IsOptional()
  @IsString()
  minPrice?: string;

  /**
   * Max Price
   * ---------
   * Purpose : Filter products with maximum price
   */
  @ApiPropertyOptional({
    description: 'Maximum price filter',
    example: '1000',
  })
  @IsOptional()
  @IsString()
  maxPrice?: string;

  /**
   * In Stock Only
   * -------------
   * Purpose : Show only products with stock > 0
   */
  @ApiPropertyOptional({
    description: 'Show only products in stock',
    example: 'true',
  })
  @IsOptional()
  @IsString()
  inStockOnly?: string;

  /**
   * Has Discount
   * ------------
   * Purpose : Show only products with active discount
   */
  @ApiPropertyOptional({
    description: 'Show only products with active discount',
    example: 'true',
  })
  @IsOptional()
  @IsString()
  hasDiscount?: string;
}