import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';


export class CreateVanInventoryTopupItemDto {
/**
 * CreateVanInventoryTopupItemDto
 * =================
 * Data Transfer Object for creating new VanInventoryTopupItem records
 */
  @ApiProperty({ type: String, description: 'Business identifier for vanInventoryTopup' })
  @IsNotEmpty()
  @IsString()
  vanInventoryTopupId: string;

  @ApiProperty({ type: String, description: 'Business identifier for product' })
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  productName: string;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  requestedCaseQty?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  requestedPieceQty?: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  requestedQty: number;

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
  approvedQty?: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  piecePrice: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  casePrice: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  pieceNetWeight: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  caseNetWeight: number;

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

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  unitQtyInCase: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  remark?: string;

}
