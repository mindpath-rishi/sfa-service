import { NonSaleStatus } from 'src/shared/enums/non-sale.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateNonSaleDto {
  /**
   * CreateNonSaleDto
   * =================
   * Data Transfer Object for creating new NonSale records
   */
  @ApiProperty({
    type: String,
    description: 'Business identifier for Reference',
  })
  @IsNotEmpty()
  @IsString()
  visitId: string;

  @ApiProperty({
    type: String,
    description: 'Business identifier for Reference',
  })
  @IsNotEmpty()
  @IsString()
  outletId: string;

  // @ApiProperty({
  //   type: String,
  //   description: 'Business identifier for Reference',
  // })
  // @IsNotEmpty()
  // @IsString()
  // routeSessionId: string;

  @ApiProperty({
    type: String,
    description: 'Business identifier for Reference',
  })
  @IsNotEmpty()
  @IsString()
  vanId: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  reasonCategoryId: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  reasonId: string;

  /**
   * Remark
   * ------
   * 🔗 Link with ShopVisit (single source of truth)
   */
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
