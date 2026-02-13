import { StockCountStatus } from 'src/shared/enums/stock-count.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';


export class CreateStockCountDto {
/**
 * CreateStockCountDto
 * =================
 * Data Transfer Object for creating new StockCount records
 */
  @ApiProperty({ type: String, description: 'Business identifier for van' })
  @IsNotEmpty()
  @IsString()
  vanId: string;

  @ApiProperty({ type: String, description: 'Business identifier for employee' })
  @IsNotEmpty()
  @IsString()
  employeeId: string;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalQuantity?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalWeight?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalValue?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  updatedById?: string;

  @ApiPropertyOptional({ enum: StockCountStatus, default: StockCountStatus.DRAFT })
  @IsOptional()
  @IsEnum(StockCountStatus)
  status?: StockCountStatus;

}
