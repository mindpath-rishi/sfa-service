import { CustomerCategoryStatus } from 'src/shared/enums/customer-category.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';

export class UpdateCustomerCategoryDto {
/**
 * CustomerCategory Update DTO
 * ====================
 * Data Transfer Object for updating CustomerCategory records
 * 
 * All fields are optional for partial updates
 */
  /**
   * Name
   * ----
   * Display name of customer category
   */

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;
  /**
   * Status
   * ------
   * Customer category availability status
   */

  @ApiPropertyOptional({ example: CustomerCategoryStatus.ACTIVE, enum: CustomerCategoryStatus })
  @IsOptional()
  @IsEnum(CustomerCategoryStatus)
  status?: CustomerCategoryStatus;

}
