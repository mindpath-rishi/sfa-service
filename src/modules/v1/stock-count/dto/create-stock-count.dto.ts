import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDate,
  IsNumber,
  IsEnum,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { StockCountStatus } from 'src/shared/enums/stock-count.enums';
import { CreateStockCountItemDto } from '../../stock-count-item/dto/create-stock-count-item.dto';
import { Type } from 'class-transformer';

export class CreateStockCountDto {
  /**
   * CreateStockCountDto
   * =================
   * DTO for creating StockCount
   */
  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  workSessionId!: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  vanId!: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  employeeId!: string;

  @ApiProperty({ type: Date })
  @IsNotEmpty()
  @IsDate()
  date!: Date;

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

  @ApiPropertyOptional({ enum: StockCountStatus, enumName: 'StockCountStatus' })
  @IsOptional()
  @IsEnum(StockCountStatus)
  status?: StockCountStatus;

  @ApiProperty({
    type: [CreateStockCountItemDto],
    description: 'Product-wise sales items',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStockCountItemDto)
  items!: CreateStockCountItemDto[];
}
