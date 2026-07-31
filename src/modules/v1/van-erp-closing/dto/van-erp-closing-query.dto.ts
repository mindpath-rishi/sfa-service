import { VanErpClosingStatus } from 'src/shared/enums/van-erp-closing.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MaxLength,
  IsDate,
  IsNumber,
  IsEnum,
} from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * VanErpClosingQueryDto
 * =================
 * DTO for querying VanErpClosing
 */
export class VanErpClosingQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Search text', example: 'abc' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  stockId?: string;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  date?: Date;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  vanId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  qtyInCase?: number;

  @ApiPropertyOptional({ enum: VanErpClosingStatus })
  @IsOptional()
  @IsEnum(VanErpClosingStatus)
  status?: VanErpClosingStatus;
}
