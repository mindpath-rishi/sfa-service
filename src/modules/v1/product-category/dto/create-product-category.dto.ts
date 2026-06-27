/**
 * Product Category Create DTO
 * ---------------------------
 * Purpose : Create new product category
 * Used by : BACK_OFFICE / ADMIN
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';
import { ProductCategoryStatus, ProductCategoryType } from 'src/core/database/mongo/schema/product-category';

export class ProductCategoryCreateDto {

  @ApiProperty({ example: 'CAT-001' })
  @IsNotEmpty()
  @IsString()
  categoryId!: string;

  @ApiProperty({ example: 'Dairy Products' })
  @IsString()
  name!: string;

  @ApiProperty({ enum: ProductCategoryType, example: ProductCategoryType.PARENT })
  @IsEnum(ProductCategoryType)
  type!: ProductCategoryType;

  @ApiProperty({ required: false, example: 'CAT-12345678' })
  @ValidateIf((dto: ProductCategoryCreateDto) => dto.type === ProductCategoryType.CHILD)
  @IsNotEmpty()
  @IsString()
  parentId?: string;

  @ApiProperty({ required: false, enum: ProductCategoryStatus })
  @IsOptional()
  @IsEnum(ProductCategoryStatus)
  status?: ProductCategoryStatus;
}
