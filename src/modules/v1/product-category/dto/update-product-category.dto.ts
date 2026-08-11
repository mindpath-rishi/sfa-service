/**
 * Product Category Update DTO
 * ---------------------------
 * Purpose : Update existing product category
 * Used by : BACK_OFFICE / ADMIN
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ProductCategoryType } from 'src/core/database/mongo/schema/product-category';

export class ProductCategoryUpdateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'ACTIVE' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: ProductCategoryType })
  @IsOptional()
  @IsEnum(ProductCategoryType)
  type?: ProductCategoryType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string;
}
