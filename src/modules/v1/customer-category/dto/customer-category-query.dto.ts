/**
 * Customer Category Query DTO
 * ---------------------------
 * Purpose : Filter and paginate customer categories
 * Used by : CATEGORY LISTING / ADMIN SCREENS
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumberString } from 'class-validator';
import { CustomerCategoryStatus } from 'src/shared/constants/customer-category.constants';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

export class CustomerCategoryQueryDto extends PaginationDto {
  @ApiProperty({ example: 'Wholesale' })
  @IsOptional()
  @IsString()
  searchText?: string;

  @ApiProperty({
    example: CustomerCategoryStatus.ACTIVE,
    enum: CustomerCategoryStatus,
  })
  @IsOptional()
  @IsString()
  status?: string;
}
