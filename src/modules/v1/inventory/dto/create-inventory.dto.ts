import { InventoryStatus } from 'src/shared/enums/inventory.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateInventoryDto {
/**
 * Inventory Create DTO
 * ====================
 * Data Transfer Object for creating new Inventory records
 */
  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.00001)
  quantity: number;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @Min(0.0001)
  reservedQuantity?: number;

  @ApiPropertyOptional({ type: Date })
  @IsDate()
  settlementDate?: Date;

  @ApiPropertyOptional({ enum: InventoryStatus, example: InventoryStatus.ACTIVE })
  @IsEnum(InventoryStatus)
  status?: InventoryStatus;

}
