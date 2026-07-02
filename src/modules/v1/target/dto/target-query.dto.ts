import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  IsNumber,
  IsDate,
  IsIn,
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
  parentCategoryId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  parentCategory?: string;

  @ApiPropertyOptional({ type: String, description: 'Child category ID' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ type: String, description: 'Child category name' })
  @IsOptional()
  @IsString()
  category?: string;

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
  targetTonnage?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  targetValue?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  uboTarget?: number;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional({ enum: ['excel', 'pdf'] })
  @IsOptional()
  @IsIn(['excel', 'pdf'])
  fileType?: 'excel' | 'pdf';

  @ApiPropertyOptional({ description: 'Comma-separated export column keys' })
  @IsOptional()
  @IsString()
  columns?: string;
}
