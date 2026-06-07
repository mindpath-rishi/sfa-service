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
 * TargetQueryDto
 * =================
 * DTO for querying Target
 */
export class TargetQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Search text', example: 'abc' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  userName?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  subCategoryId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  subCategory?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  targetCases?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  achievedCases?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  targetTonnage?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  achievedTonnage?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  targetValue?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  achievedValue?: number;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  status?: string;
}
