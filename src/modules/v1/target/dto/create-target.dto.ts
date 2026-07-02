import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsDate,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTargetDto {
  /**
   * CreateTargetDto
   * =================
   * DTO for creating Target
   */
  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  userId!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  userName?: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  parentCategoryId!: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  parentCategory!: string;

  @ApiProperty({ type: String, description: 'Child category ID' })
  @IsNotEmpty()
  @IsString()
  categoryId!: string;

  @ApiProperty({ type: String, description: 'Child category name' })
  @IsNotEmpty()
  @IsString()
  category!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Min(0)
  targetCases?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Min(0)
  targetTonnage?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Min(0)
  targetValue?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  uboTarget?: number;

  @ApiProperty({ type: Date })
  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  startDate!: Date;

  @ApiProperty({ type: Date })
  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  endDate!: Date;
}
