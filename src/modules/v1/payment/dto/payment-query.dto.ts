import { PaymentMode, PaymentStatus } from 'src/shared/enums/payment.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { string } from 'joi';
import { Type } from 'class-transformer';

/**
 * PaymentQueryDto
 * =================
 * Data Transfer Object for querying Payment records
 *
 * All fields are optional - supports partial matching and range queries
 * Extends PaginationDto for pagination support
 */
export class PaymentQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description:
      'Search by name, code, or identifier (supports partial matching)',
    example: 'search term',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Business identifier for payment',
  })
  @IsOptional()
  @IsString()
  paymentId?: string;

  @ApiPropertyOptional({ type: String, description: 'Filter by customer ID' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ type: String, description: 'Filter by van ID' })
  @IsOptional()
  @IsString()
  vanId?: string;

  @ApiPropertyOptional({ type: String, description: 'Filter by employee ID' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({
    type: Number,
    description: 'Supports operators: gt, gte, lt, lte',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({
    enum: PaymentMode,
    isArray: true,
    description: 'Filter by multiple payment modes',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(PaymentMode, { each: true })
  paymentMode?: PaymentMode[];

  @ApiPropertyOptional({
    enum: PaymentStatus,
    isArray: true,
    description: 'Filter by multiple statuses',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(PaymentStatus, { each: true })
  status?: PaymentStatus[];

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  /**
   * ReferenceNo
   * -----------
   * Total amount collected
   */
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  referenceNo?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  remark?: string;
}
