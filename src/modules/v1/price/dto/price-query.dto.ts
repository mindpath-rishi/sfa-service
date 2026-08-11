import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MaxLength,
  IsNumber,
  IsDate,
} from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * PriceQueryDto
 * =================
 * DTO for querying Price
 */
export class PriceQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Search text', example: 'abc' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  categoryName?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  categoryCode?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  priceInclVat?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  priceExclVat?: number;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  effectiveDate?: Date;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  priceFlag?: string;
}
