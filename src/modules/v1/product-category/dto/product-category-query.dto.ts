/**
 * Product Category Query DTO
 * --------------------------
 * Purpose : Filter and paginate categories
 * Used by : CATEGORY LISTING / ADMIN SCREENS
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumberString } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

export class ProductCategoryQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  searchText?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
