import {
  SalePaymentStatus,
  SaleStatus,
  SaleType,
} from 'src/shared/enums/sale.enums';
import { PaymentMode } from 'src/shared/enums/payment.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateSaleItemDto } from '../../sale-item/dto/create-sale-item.dto';

export class CreateSaleEmployeeDto {
  @ApiProperty({
    type: String,
    description: 'Business identifier for employee',
    example: 'EMP001',
  })
  @IsNotEmpty()
  @IsString()
  employeeId!: string;

  @ApiProperty({
    type: String,
    description: 'Employee name',
    example: 'Ramesh',
  })
  @IsNotEmpty()
  @IsString()
  employeeName!: string;

  @ApiProperty({
    type: String,
    description: 'Employee role in sale',
    example: 'SALESMAN',
  })
  @IsNotEmpty()
  @IsString()
  role!: string;
}

export class CreateSaleDto {
  /**
   * CreateSaleDto
   * =================
   * Data Transfer Object for creating new Sales records
   */

  @ApiProperty({ type: String, description: 'Business identifier for van' })
  @IsNotEmpty()
  @IsString()
  vanId!: string;

  @ApiProperty({ type: String, description: 'Company code' })
  @IsNotEmpty()
  @IsString()
  compCode!: string;

  @ApiProperty({ type: String, description: 'Child categoryId' })
  @IsNotEmpty()
  @IsString()
  categoryId!: string;

  @ApiProperty({ type: String, description: 'Parent categoryId' })
  @IsNotEmpty()
  @IsString()
  parentCategoryId!: string;

  @ApiProperty({ type: String, description: 'Van name' })
  @IsNotEmpty()
  @IsString()
  vanName!: string;

  @ApiProperty({
    type: String,
    description: 'Business identifier for customer',
  })
  @IsNotEmpty()
  @IsString()
  customerId!: string;

  @ApiProperty({
    type: String,
    description: 'Visit Id',
  })
  @IsNotEmpty()
  @IsString()
  visitId!: string;

  @ApiProperty({ type: String, description: 'Customer name' })
  @IsNotEmpty()
  @IsString()
  customerName!: string;

  @ApiProperty({
    type: [CreateSaleEmployeeDto],
    required: false,
    description:
      'Employees involved in sale. Ignored on create; derived from logged-in employee.',
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
  @Type(() => CreateSaleEmployeeDto)
  employees?: CreateSaleEmployeeDto[];

  @ApiProperty({ type: Date })
  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  date!: Date;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  totalCases?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  totalPieces?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsNotEmpty()
  @IsNumber()
  totalQty!: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsNotEmpty()
  @IsNumber()
  totalWeight!: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsNotEmpty()
  @IsNumber()
  totalValue!: number;

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
  @IsNumber()
  paidAmount!: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  pendingAmount!: number;

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

  @ApiProperty({ enum: PaymentMode })
  @IsNotEmpty()
  @IsEnum(PaymentMode)
  paymentMode!: PaymentMode;

  @ApiProperty({
    type: [CreateSaleItemDto],
    description: 'Product-wise sales items',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[];
}
