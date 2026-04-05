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
  MinLength,
} from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { string } from 'joi';

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
  @MinLength(2)
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
    description: 'Filter by paymentMode',
  })
  @IsOptional()
  @IsEnum(PaymentMode)
  paymentMode?: PaymentMode;

  @ApiPropertyOptional({
    enum: PaymentStatus,
    description: 'Filter by status',
    example: PaymentStatus.SUCCESS,
    default: PaymentStatus.SUCCESS,
  })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
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
