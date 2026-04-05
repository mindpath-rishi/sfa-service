import { CustomerStatus } from 'src/shared/enums/customer.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateGeoTagDto {
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;
}

export class UpdateCustomerDto {
  /**
   * Customer Update DTO
   * ====================
   * Data Transfer Object for updating Customer records
   *
   * All fields are optional for partial updates
   */
  @ApiPropertyOptional({ type: String, description: 'Reference ID' })
  @IsOptional()
  @IsString()
  customerCategoryId?: string;

  @ApiPropertyOptional({ type: String, description: 'Reference ID' })
  @IsOptional()
  @IsString()
  channelId?: string;

  @ApiPropertyOptional({ type: String, description: 'Reference ID' })
  @IsOptional()
  @IsString()
  outletTypeId?: string;

  @ApiPropertyOptional({ type: String, description: 'Reference ID' })
  @IsOptional()
  @IsString()
  marketId?: string;

  @ApiPropertyOptional({ type: String, description: 'Reference ID' })
  @IsOptional()
  @IsString()
  provinceId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  ownerName?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  outletName?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    type: () => UpdateGeoTagDto,
    description: 'Update embedded GeoTag object',
  })
  @IsOptional()
  @ValidateNested()
  @ValidateNested()
  @Type(() => UpdateGeoTagDto)
  geoTag?: UpdateGeoTagDto;

  /**
   * Status
   * ------
   * Reference of customer category
   */
  @ApiPropertyOptional({ enum: CustomerStatus, example: CustomerStatus.ACTIVE })
  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  lastVisitedAt?: Date;
}
