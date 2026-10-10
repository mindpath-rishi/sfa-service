/**
 * Bulk Customer (Outlet) Upload DTO
 * ---------------------------------
 * Purpose : Create or update many outlets in one request
 * Used by : ADMIN PANEL bulk outlet upload
 *
 * Notes:
 * - A row with customerId updates that outlet, otherwise a new
 *   outlet is created through the normal create flow
 *   (verification pending + outlet verification record)
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateCustomerDto } from './create-customer.dto';

export const CUSTOMER_BULK_UPLOAD_LIMIT = 1000;

export class BulkUploadCustomerItemDto extends CreateCustomerDto {
  @ApiPropertyOptional({
    type: String,
    description: 'Existing outlet ID; when set the outlet is updated',
  })
  @IsOptional()
  @IsString()
  customerId?: string;
}

export class BulkUploadCustomerDto {
  @ApiProperty({ type: () => [BulkUploadCustomerItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CUSTOMER_BULK_UPLOAD_LIMIT)
  @ValidateNested({ each: true })
  @Type(() => BulkUploadCustomerItemDto)
  customers!: BulkUploadCustomerItemDto[];
}
