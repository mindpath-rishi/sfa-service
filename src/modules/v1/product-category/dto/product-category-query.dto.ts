/**
 * Product Category Query DTO
 * --------------------------
 * Purpose : Filter and paginate categories
 * Used by : CATEGORY LISTING / ADMIN SCREENS
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { ProductCategoryType } from 'src/core/database/mongo/schema/product-category';

export class ProductCategoryQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  searchText?: string;

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
