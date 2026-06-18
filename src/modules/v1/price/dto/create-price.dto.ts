import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsDate,
} from 'class-validator';

export class CreatePriceDto {
  /**
   * CreatePriceDto
   * =================
   * DTO for creating Price
   */
  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  productId!: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  categoryName!: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  categoryCode!: string;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  priceInclVat!: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  priceExclVat!: number;

  @ApiProperty({ type: Date })
  @IsNotEmpty()
  @IsDate()
  effectiveDate!: Date;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  priceFlag!: string;
}
