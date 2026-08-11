import { RouteStatus } from 'src/shared/enums/route.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  IsArray,
  Min,
} from 'class-validator';

import { Type } from 'class-transformer';

/* ======================================================
 * ROUTE CUSTOMER DTO
 * ====================================================== */

export class RouteCustomerDto {
  @ApiProperty({
    type: String,
    description: 'Business identifier for customer',
  })
  @IsNotEmpty()
  @IsString()
  customerId!: string;

  @ApiProperty({
    type: Number,
    description: 'Visit sequence order',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  sequence!: number;
}

/* ======================================================
 * CREATE ROUTE DTO
 * ====================================================== */

export class CreateRouteDto {
  @ApiProperty({
    type: String,
  })
  @IsNotEmpty()
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Business identifier for country',
  })
  @IsOptional()
  @IsString()
  countryId?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Business identifier for province',
  })
  @IsOptional()
  @IsString()
  provinceId?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Business identifier for market',
  })
  @IsOptional()
  @IsString()
  marketId?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Business identifier for customer category',
  })
  @IsOptional()
  @IsString()
  customerCategoryId?: string;

  @ApiPropertyOptional({
    type: () => [RouteCustomerDto],
    description: 'List of outlets with sequence',
    default: [],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteCustomerDto)
  associatedCustomers?: RouteCustomerDto[];

  @ApiPropertyOptional({
    type: Number,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  outletCount?: number;

  /**
   * ✅ Status
   */
  @ApiPropertyOptional({
    enum: RouteStatus,
    default: RouteStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(RouteStatus)
  status?: RouteStatus;
}
