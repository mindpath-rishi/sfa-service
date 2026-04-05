/**
 * Product Category Create DTO
 * ---------------------------
 * Purpose : Create new product category
 * Used by : BACK_OFFICE / ADMIN
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ProductCategoryCreateDto {

  @ApiProperty({ example: 'Dairy Products' })
  @IsString()
  name: string;
}
