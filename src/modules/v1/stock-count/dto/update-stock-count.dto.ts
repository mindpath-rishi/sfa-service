import { StockCountStatus } from 'src/shared/enums/stock-count.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';


export class UpdateStockCountDto {
/**
 * UpdateStockCountDto
 * =================
 * Data Transfer Object for updating StockCount records
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
  employeeId?: string;

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
