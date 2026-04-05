import { SaleType, SaleStatus } from 'src/shared/enums/sale.enums';
import { PaymentMode, PaymentStatus } from 'src/shared/enums/payment.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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

export class CreateSaleDto {
  /**
   * CreateSalesDto
   * =================
   * Data Transfer Object for creating new Sales records
   */
  @ApiProperty({ type: String, description: 'Business identifier for van' })
  @IsNotEmpty()
  @IsString()
  vanId: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  vanName: string;

  @ApiProperty({
    type: String,
    description: 'Business identifier for customer',
  })
  @IsNotEmpty()
  @IsString()
  customerId: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  customerName: string;

  @ApiProperty({
    type: String,
    description: 'Business identifier for employee',
  })
  @IsNotEmpty()
  @IsString()
  employeeId: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  employeeName: string;

  @ApiProperty({ type: Date })
  @IsNotEmpty()
  @IsDate()
  date: Date;

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
  totalQty: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsNotEmpty()
  @IsNumber()
  totalWeight: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsNotEmpty()
  @IsNumber()
  totalValue: number;

  @ApiPropertyOptional({
    enum: SaleType,
    example: SaleType.CASH,
    default: SaleType.CASH,
  })
  @IsNotEmpty()
  @IsEnum(SaleType)
  type?: SaleType;

  @ApiPropertyOptional({ enum: PaymentStatus, default: PaymentStatus.PENDING })
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  paidAmount: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  pendingAmount: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({
    enum: SaleStatus,
    example: SaleStatus.DRAFT,
    default: SaleStatus.DRAFT,
    description: 'Amount received',
  })
  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @ApiProperty({ enum: PaymentMode })
  @IsNotEmpty()
  @IsEnum(PaymentMode)
  paymentMode: PaymentMode;

  @ApiProperty({
    type: [CreateSaleItemDto],
    description: 'Product-wise sales items',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items: CreateSaleItemDto[];
}
