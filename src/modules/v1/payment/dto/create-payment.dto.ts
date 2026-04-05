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
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PaymentSaleItemDto {
  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  saleId: string;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  amount: number;
}

export class CreatePaymentDto {
  /**
   * CreatePaymentDto
   * =================
   * Data Transfer Object for creating new Payment records
   */
  @ApiProperty({
    type: String,
    description: 'Business identifier for customer',
  })
  @IsNotEmpty()
  @IsString()
  customerId: string;

  @ApiProperty({ type: String, description: 'Business identifier for van' })
  @IsNotEmpty()
  @IsString()
  vanId: string;

  @ApiProperty({
    type: String,
    description: 'Business identifier for employee',
  })
  @IsNotEmpty()
  @IsString()
  employeeId: string;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  amount: number;

  @ApiProperty({ enum: PaymentMode })
  @IsNotEmpty()
  @IsEnum(PaymentMode)
  paymentMode: PaymentMode;

  @ApiPropertyOptional({
    enum: PaymentStatus,
    example: PaymentStatus.SUCCESS,
    default: PaymentStatus.SUCCESS,
  })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiProperty({ type: Date })
  @IsNotEmpty()
  @IsDate()
  date: Date;

  /**
   * ReferenceNo
   * -----------
   * Total amount collected
   */
  @ApiPropertyOptional({ type: String, default: '' })
  @IsOptional()
  @IsString()
  referenceNo?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiProperty({
    type: [PaymentSaleItemDto],
    description: 'List of sales this payment is applied to',
    default: [],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentSaleItemDto)
  sales?: PaymentSaleItemDto[];
}
