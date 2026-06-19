import {
  SalePaymentStatus,
  SaleStatus,
  SaleType,
} from 'src/shared/enums/sale.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSaleEmployeeDto {
  @ApiPropertyOptional({
    type: String,
    description: 'Business identifier for employee',
    example: 'EMP001',
  })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Employee name',
    example: 'Ramesh',
  })
  @IsOptional()
  @IsString()
  employeeName?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Employee role in sale',
    example: 'SALESMAN',
  })
  @IsOptional()
  @IsString()
  role?: string;
}

export class UpdateSaleDto {
  /**
   * UpdateSaleDto
   * =================
   * Data Transfer Object for updating Sales records
   *
   * All fields are optional for partial updates
   * Supports partial updates - omitted fields will retain their existing values
   */

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  vanId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  visitId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  vanName?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional({
    type: [UpdateSaleEmployeeDto],
    description: 'Employees involved in sale',
    example: [
      {
        employeeId: 'EMP001',
        employeeName: 'Ramesh',
        role: 'SALESMAN',
      },
      {
        employeeId: 'EMP002',
        employeeName: 'Suresh',
        role: 'DRIVER',
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateSaleEmployeeDto)
  employees?: UpdateSaleEmployeeDto[];

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalCases?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  netCases?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalPieces?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalQty?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalWeight?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalValue?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalReturnCases?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalReturnPieces?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalReturnQty?: number;

  @ApiPropertyOptional({
    enum: SaleType,
    example: SaleType.CASH,
    default: SaleType.CASH,
  })
  @IsOptional()
  @IsEnum(SaleType)
  type?: SaleType;

  @ApiPropertyOptional({
    enum: SalePaymentStatus,
    default: SalePaymentStatus.UNPAID,
  })
  @IsOptional()
  @IsEnum(SalePaymentStatus)
  paymentStatus?: SalePaymentStatus;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  paidAmount?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
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
    example: SaleStatus.COMPLETED,
    default: SaleStatus.COMPLETED,
    description: 'Sale status',
  })
  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;
}
