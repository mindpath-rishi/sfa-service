/**
 * Bulk Customer (Outlet) Upload DTO
 * ---------------------------------
 * Purpose : Create many outlets in one request
 * Used by : ADMIN PANEL bulk outlet upload
 *
 * Notes:
 * - Create only: rows default to verification pending; rows with ACTIVE
 *   status are automatically approved by the logged-in uploader.
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
    const normalized = String(value).trim().replace(/^FO_(?:TOKEN|TKON)_/i, '');
    return normalized || undefined;
  })
  @IsOptional()
  @IsString()
  declare outletId?: string;

  // Accept customerId for older clients; MIS sends outletId.
  @Transform(({ value }) => {
    if (value === null || value === undefined) return undefined;
    const normalized = String(value).trim().replace(/^FO_(?:TOKEN|TKON)_/i, '');
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
