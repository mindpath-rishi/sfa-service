import { VanInventoryStatus } from 'src/shared/enums/van-inventory.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';


export class CreateVanInventoryDto {
/**
 * CreateVanInventoryDto
 * =================
 * Data Transfer Object for creating new VanInventory records
 */
  @ApiProperty({ type: String, description: 'Business identifier for product' })
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiProperty({ type: String, description: 'Business identifier for van' })
  @IsNotEmpty()
  @IsString()
  vanId: string;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.00001)
  quantity: number;

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
