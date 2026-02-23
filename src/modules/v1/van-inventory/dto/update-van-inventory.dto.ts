import { VanInventoryStatus } from 'src/shared/enums/van-inventory.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';


export class UpdateVanInventoryDto {
/**
 * UpdateVanInventoryDto
 * =================
 * Data Transfer Object for updating VanInventory records
 * 
 * All fields are optional for partial updates
 * Supports partial updates - omitted fields will retain their existing values
 */
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  vanId?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Min(0.00001)
  quantity?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  reservedQuantity?: number;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  settlementDate?: Date;

  @ApiPropertyOptional({ enum: VanInventoryStatus, default: VanInventoryStatus.ACTIVE })
  @IsOptional()
  @IsEnum(VanInventoryStatus)
  status?: VanInventoryStatus;

}
