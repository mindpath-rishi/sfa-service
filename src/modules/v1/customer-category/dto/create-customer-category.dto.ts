import { CustomerCategoryStatus } from 'src/shared/enums/customer-category.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';

export class CreateCustomerCategoryDto {
/**
 * CustomerCategory Create DTO
 * ====================
 * Data Transfer Object for creating new CustomerCategory records
 */
  /**
   * Name
   * ----
   * Display name of customer category
   */

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string;
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
