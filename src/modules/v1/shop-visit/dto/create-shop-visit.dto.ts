import {
  ShopVisitStatus,
  ShopVisitType,
} from 'src/shared/enums/shop-visit.enums';

import { ApiProperty } from '@nestjs/swagger';

import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

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
  routeSessionId!: string;

  @ApiProperty({
    type: String,
    description: 'Business identifier for workSession',
  })
  @IsNotEmpty()
  @IsString()
  workSessionId!: string;

  @ApiProperty({
    type: String,
    description: 'Business identifier for van',
  })
  @IsNotEmpty()
  @IsString()
  vanId!: string;

  @ApiProperty({
    type: String,
    description: 'Business identifier for outlet',
  })
  @IsNotEmpty()
  @IsString()
  outletId!: string;

  @ApiProperty({
    enum: ShopVisitType,
    example: ShopVisitType.ON_SITE,
    description: 'Visit type (ON_SITE / OFF_SITE)',
  })
  @IsNotEmpty()
  @IsEnum(ShopVisitType)
  visitType!: ShopVisitType;
}
