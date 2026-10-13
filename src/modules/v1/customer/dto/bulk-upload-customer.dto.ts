/**
 * Bulk Customer (Outlet) Upload DTO
 * ---------------------------------
 * Purpose : Create many outlets in one request
 * Used by : ADMIN PANEL bulk outlet upload
 *
 * Notes:
 * - Create only: every row goes through the normal create flow
 *   (verification pending + outlet verification record).
 *   An optional customerId can be supplied; otherwise the system generates one.
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
import { Transform, Type } from 'class-transformer';
import { CreateCustomerDto } from './create-customer.dto';

export const CUSTOMER_BULK_UPLOAD_LIMIT = 100000;

export class BulkUploadCustomerItemDto extends CreateCustomerDto {
  @ApiPropertyOptional({ type: String, description: 'Outlet ID; generated when omitted' })
  @Transform(({ value }) => {
    if (value === null || value === undefined) return undefined;
    const normalized = String(value).trim().replace(/^FO_TKON_/, '');
    return normalized || undefined;
  })
  @IsOptional()
  @IsString()
  declare customerId?: string;

  @ApiPropertyOptional({ type: String })
  @Transform(({ value }) =>
    value === null || String(value).trim() === '' ? undefined : value,
  )
  @IsOptional()
  @IsString()
  declare phoneNumber: string;
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
