import { CustomerStatus } from 'src/shared/enums/customer.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
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

class AddressDto {
  @ApiProperty({ example: '123 Main Street' })
  @IsNotEmpty()
  @IsString()
  @Length(3, 150)
  line1!: string;

  @ApiProperty({ example: 'Near City Mall', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 150)
  line2?: string;
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
  customerTypeId?: string;

  @ApiPropertyOptional({ type: String, description: 'Reference ID' })
  @IsOptional()
  @IsString()
  channelId?: string;

  @ApiPropertyOptional({ type: String, description: 'Reference ID' })
  @IsOptional()
  @IsString()
  segmentation?: string;

  @ApiPropertyOptional({ type: String, description: 'Reference ID' })
  @IsOptional()
  @IsString()
  countryId?: string;

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
  name?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  outletName?: string;

  @ApiPropertyOptional({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  address!: AddressDto;

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
