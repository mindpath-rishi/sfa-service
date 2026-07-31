import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { SchemeStatus, SchemeType } from 'src/shared/enums/scheme.enums';

/**
 * SchemeQueryDto
 * =================
 * DTO for querying Scheme
 */
export class SchemeQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Search text', example: 'abc' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  subCategoryId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  provinceId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  routeId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  vanId?: string;

  @ApiPropertyOptional({ enum: SchemeType })
  @IsOptional()
  @IsEnum(SchemeType)
  schemeType?: SchemeType;

  @ApiPropertyOptional({ enum: SchemeStatus })
  @IsOptional()
  @IsEnum(SchemeStatus)
  status?: SchemeStatus;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveDate?: Date;
}
