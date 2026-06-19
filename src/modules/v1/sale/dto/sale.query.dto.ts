import {
  SalePaymentStatus,
  SaleStatus,
  SaleType,
} from 'src/shared/enums/sale.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * SalesQueryDto
 * =================
 * Data Transfer Object for querying Sales records
 *
 * All fields are optional - supports partial matching and range queries
 * Extends PaginationDto for pagination support
 */
export class SaleQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description:
      'Search by customer name, van name, sale ID, employee name, or employee ID',
    example: 'search term',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Business identifier for sales',
  })
  @IsOptional()
  @IsString()
  salesId?: string;

  @ApiPropertyOptional({ type: String, description: 'Filter by van ID' })
  @IsOptional()
  @IsString()
  vanId?: string;

  @ApiPropertyOptional({ type: String, description: 'Filter by van name' })
  @IsOptional()
  @IsString()
  vanName?: string;

  @ApiPropertyOptional({ type: String, description: 'Filter by customer ID' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ type: String, description: 'Filter by customer name' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Filter by employee ID from employees array',
  })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Filter by employee name from employees array',
  })
  @IsOptional()
  @IsString()
  employeeName?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Filter by employee role from employees array',
    example: 'SALESMAN',
  })
  @IsOptional()
  @IsString()
  employeeRole?: string;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @ApiPropertyOptional({
    type: Number,
    description: 'Supports operators: gt, gte, lt, lte',
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalCases?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Supports operators: gt, gte, lt, lte',
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalPieces?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Supports operators: gt, gte, lt, lte',
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalQty?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Supports operators: gt, gte, lt, lte',
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalWeight?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Supports operators: gt, gte, lt, lte',
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalValue?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Supports operators: gt, gte, lt, lte',
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalReturnCases?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Supports operators: gt, gte, lt, lte',
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalReturnPieces?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Supports operators: gt, gte, lt, lte',
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalReturnQty?: number;

  @ApiPropertyOptional({
    enum: SaleType,
    description: 'Filter by sale type',
    example: SaleType.CASH,
    default: SaleType.CASH,
  })
  @IsOptional()
  @IsEnum(SaleType)
  type?: SaleType;

  @ApiPropertyOptional({
    enum: SalePaymentStatus,
    description: 'Filter by sale payment status',
    default: SalePaymentStatus.UNPAID,
  })
  @IsOptional()
  @IsEnum(SalePaymentStatus)
  paymentStatus?: SalePaymentStatus;

  @ApiPropertyOptional({
    type: Number,
    description: 'Supports operators: gt, gte, lt, lte',
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  paidAmount?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Supports operators: gt, gte, lt, lte',
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pendingAmount?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({
    enum: SaleStatus,
    description: 'Filter by status',
    example: SaleStatus.COMPLETED,
    default: SaleStatus.COMPLETED,
  })
  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;
}
