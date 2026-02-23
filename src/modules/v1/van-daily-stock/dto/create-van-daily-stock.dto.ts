import { VanDailyStockStatus } from 'src/shared/enums/van-daily-stock.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';


export class CreateVanDailyStockDto {
/**
 * CreateVanDailyStockDto
 * =================
 * Data Transfer Object for creating new VanDailyStock records
 */
  @ApiProperty({ type: Date })
  @IsNotEmpty()
  @IsDate()
  date: Date;

  @ApiProperty({ type: String, description: 'Business identifier for employee' })
  @IsNotEmpty()
  @IsString()
  employeeId: string;

  @ApiProperty({ type: String, description: 'Business identifier for van' })
  @IsNotEmpty()
  @IsString()
  vanId: string;

  @ApiProperty({ type: String, description: 'Business identifier for product' })
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  openingQty?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  inQty?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  outQty?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  adjustmentQty?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  closingQty?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({ enum: VanDailyStockStatus, default: VanDailyStockStatus.DRAFT })
  @IsOptional()
  @IsEnum(VanDailyStockStatus)
  status?: VanDailyStockStatus;

}
