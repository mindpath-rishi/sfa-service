import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsDate,
} from 'class-validator';

export class CreateStockCountItemDto {
  /**
   * CreateStockCountItemDto
   * =================
   * DTO for creating StockCountItem
   */
  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  stockCountId!: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  productId!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  productName?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  vanId?: string;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  systemQty!: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  systemCases?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  systemPieces?: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  countedQty!: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  countedCases?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  countedPieces?: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  varianceQty!: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  varianceCases?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  variancePieces?: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  piecePrice!: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  systemValue!: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  countedValue!: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  varianceValue!: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  unitQtyInCase!: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  countedBy?: string;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  countedAt?: Date;
}
