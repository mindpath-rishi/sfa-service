import {
  ShopVisitStatus,
  ShopVisitType,
} from 'src/shared/enums/shop-visit.enums';

import { ApiProperty } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { LocationPointDto } from 'src/shared/dto/location-point.dto';

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
    description: 'Deprecated. Visit type is calculated by the server.',
    required: false,
  })
  @IsOptional()
  @IsEnum(ShopVisitType)
  visitType?: ShopVisitType;

  @ApiProperty({ type: LocationPointDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationPointDto)
  checkInLocation?: LocationPointDto;

  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  interactionId?: string;
}
