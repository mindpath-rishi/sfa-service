/**
 * Customer Category Create DTO
 * ----------------------------
 * Purpose : Create new customer category
 * Used by : BACK_OFFICE / ADMIN
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateCustomerCategoryDto {
  @ApiProperty({ example: 'Retail Customers' })
  @IsString()
  name: string;
}
