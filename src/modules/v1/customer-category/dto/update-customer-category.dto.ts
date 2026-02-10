/**
 * Customer Category Update DTO
 * ----------------------------
 * Purpose : Update existing customer category
 * Used by : BACK_OFFICE / ADMIN
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CustomerCategory } from 'src/core/database/mongo/schema/customer-category.schema';
import { CustomerCategoryStatus } from 'src/shared/constants/customer-category.constants';

export class UpdateCustomerCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'ACTIVE', enum: CustomerCategoryStatus })
  @IsOptional()
  @IsString()
  status?: string;
}
