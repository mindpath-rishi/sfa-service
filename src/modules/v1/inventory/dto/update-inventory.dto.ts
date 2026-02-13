import { InventoryStatus } from 'src/shared/enums/inventory.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateInventoryDto {
/**
 * Inventory Update DTO
 * ====================
 * Data Transfer Object for updating Inventory records
 * 
 * All fields are optional for partial updates
 */
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Min(0.00001)
  quantity?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  reservedQuantity?: number;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  settlementDate?: Date;

  @ApiPropertyOptional({ enum: InventoryStatus, example: InventoryStatus.ACTIVE })
  @IsOptional()
  @IsEnum(InventoryStatus)
  status?: InventoryStatus;

}
