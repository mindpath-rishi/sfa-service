/**
 * Product Update DTO
 * ------------------
 * Purpose : Update existing product master record
 * Used by : BACK_OFFICE / ADMIN
 *
 * Supports:
 * - Partial product updates
 * - Pricing changes
 * - Unit modifications
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, IsEnum } from 'class-validator';
import {
  PriceType,
  ProductStatus,
} from 'src/shared/enums/product.enums';

export class ProductUpdateDto {
  /**
   * Product Name
   * ------------
   * Purpose : Update product display name
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  /**
   * Category ID
   * -----------
   * Purpose : Update product category
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  /**
   * Price
   * -----
   * Purpose : Update selling price
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  price?: number;

  /**
   * Net Weight
   * ----------
   * Purpose : Update product weight
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  netWeight?: number;

  /**
   * Price Type
   * ----------
   * Purpose : Update price classification
   */
  @ApiPropertyOptional({ enum: PriceType })
  @IsOptional()
  @IsEnum(PriceType)
  priceType?: PriceType;

  /**
   * Unit Type
   * ---------
   * Purpose : Update unit type
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unitType?: string;

  /**
   * Unit Size
   * ---------
   * Purpose : Update unit size
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unitSize?: string;

  /**
   * Quantity Per Case
   * -----------------
   * Purpose : Update units per case
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unitQtyInCase?: string;

  /**
   * Status
   * ----------
   * Purpose : Update product availability status
   * Example : ACTIVE, INACTIVE
   */
  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
