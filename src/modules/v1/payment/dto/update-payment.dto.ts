import { PaymentMode, PaymentStatus } from 'src/shared/enums/payment.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDate, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';


export class UpdatePaymentDto {
/**
 * UpdatePaymentDto
 * =================
 * Data Transfer Object for updating Payment records
 * 
 * All fields are optional for partial updates
 * Supports partial updates - omitted fields will retain their existing values
 */
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  vanId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ enum: PaymentMode })
  @IsOptional()
  @IsEnum(PaymentMode)
  paymentMode?: PaymentMode;

  @ApiPropertyOptional({ enum: PaymentStatus, example: PaymentStatus.SUCCESS, default: PaymentStatus.SUCCESS })
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
  @ApiPropertyOptional({ type: String , default: [] })
  @IsOptional()
  @IsString()
  referenceNo?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  remark?: string;

}
