import { StockCountStatus } from 'src/shared/enums/stock-count.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  IsDate,
  IsNumber,
  IsEnum,
} from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * StockCountQueryDto
 * =================
 * DTO for querying StockCount
 */
export class StockCountQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Search text', example: 'abc' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  workSessionId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  vanId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  date?: Date;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  systemQty?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  systemCase?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  systemPiece?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  systemWeight?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  systemValue?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  countedQty?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  countedCase?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  countedPiece?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  countedWeight?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  countedValue?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  varianceQty?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  varianceCase?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  variancePiece?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  varianceWeight?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  varianceValue?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  createdById?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  updatedById?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  approvedById?: string;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  approvedAt?: Date;

  @ApiPropertyOptional({ enum: StockCountStatus })
  @IsOptional()
  @IsEnum(StockCountStatus)
  status?: StockCountStatus;
}
