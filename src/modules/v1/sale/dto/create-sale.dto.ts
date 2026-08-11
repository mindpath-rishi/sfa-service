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

export class AppliedSaleSchemeDto {
  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  schemeId!: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  schemeName!: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  schemeType!: string;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  minimumQuantity?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  discountPercent?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  discountValue?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  buyQty?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  discountAmount?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  freeQty?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  freeProductId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  freeProductName?: string;
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

  @ApiPropertyOptional({
    type: Number,
    description: 'Gross value before scheme discounts',
  })
  @IsOptional()
  @IsNumber()
  subtotal?: number;

  @ApiPropertyOptional({
    type: [String],
    description: 'Applied scheme identifiers',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  schemeIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Applied scheme names' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  schemeNames?: string[];

  @ApiPropertyOptional({ type: Number, description: 'Total scheme discount' })
  @IsOptional()
  @IsNumber()
  schemeDiscountAmount?: number;

  @ApiPropertyOptional({
    type: [AppliedSaleSchemeDto],
    description:
      'Applied scheme snapshots. The server recalculates these from sale items before storage.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AppliedSaleSchemeDto)
  schemes?: AppliedSaleSchemeDto[];

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
