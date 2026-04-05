import { ShopVisitStatus } from 'src/shared/enums/shop-visit.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateShopVisitDto {
  /**
   * CreateShopVisitDto
   * =================
   * Data Transfer Object for creating new ShopVisit records
   */
  @ApiProperty({
    type: String,
    description: 'Business identifier for routeSession',
  })
  @IsNotEmpty()
  @IsString()
  routeSessionId: string;

  @ApiProperty({
    type: String,
    description: 'Business identifier for workSession',
  })
  @IsNotEmpty()
  @IsString()
  workSessionId: string;

  @ApiProperty({ type: String, description: 'Business identifier for van' })
  @IsNotEmpty()
  @IsString()
  vanId: string;

  @ApiProperty({ type: String, description: 'Business identifier for outlet' })
  @IsNotEmpty()
  @IsString()
  outletId: string;
}
