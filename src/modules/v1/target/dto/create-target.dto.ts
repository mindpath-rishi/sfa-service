import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsDate,
} from 'class-validator';

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
  categoryId!: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  category!: string;

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

  @ApiProperty({ type: Date })
  @IsNotEmpty()
  @IsDate()
  startDate!: Date;

  @ApiProperty({ type: Date })
  @IsNotEmpty()
  @IsDate()
  endDate!: Date;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  status!: string;
}
