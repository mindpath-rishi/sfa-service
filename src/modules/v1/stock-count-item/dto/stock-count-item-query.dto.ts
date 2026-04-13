import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  IsNumber,
  IsDate,
} from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * StockCountItemQueryDto
 * =================
 * DTO for querying StockCountItem
 */
export class StockCountItemQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Search text', example: 'abc' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  stockCountId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  productName?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  vanId?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  systemQty?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  systemCases?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  systemPieces?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  countedQty?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  countedCases?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  countedPieces?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  varianceQty?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  varianceCases?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  variancePieces?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  piecePrice?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  systemValue?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  countedValue?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  varianceValue?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  unitQtyInCase?: number;

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
