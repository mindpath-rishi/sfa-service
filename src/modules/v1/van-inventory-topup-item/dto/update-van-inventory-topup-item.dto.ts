import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';


export class UpdateVanInventoryTopupItemDto {
/**
 * UpdateVanInventoryTopupItemDto
 * =================
 * Data Transfer Object for updating VanInventoryTopupItem records
 * 
 * All fields are optional for partial updates
 * Supports partial updates - omitted fields will retain their existing values
 */
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  vanInventoryTopupId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  productName?: string;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  requestedCaseQty?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  requestedPieceQty?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  requestedQuantity?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  approvedCaseQty?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  approvedPieceQty?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  approvedQuantity?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  piecePrice?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  casePrice?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  pieceNetWeight?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  caseNetWeight?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  requestedWeight?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  requestedValue?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  approvedWeight?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  approvedValue?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  unitQtyInCase?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  remark?: string;

}
