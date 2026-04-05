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

export class GeoTagDto {
  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;
}

class AddressDto {
  @ApiProperty({ example: '123 Main Street' })
  @IsNotEmpty()
  @IsString()
  @Length(3, 150)
  line1: string;

  @ApiProperty({ example: 'Near City Mall', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 150)
  line2?: string;
}

export class CreateCustomerDto {
  /**
   * Outlet Create DTO
   * ====================
   * Data Transfer Object for creating new Outlet records
   */
  @ApiProperty({ type: String, description: 'Reference ID' })
  @IsNotEmpty()
  @IsString()
  customerCategoryId: string;

  @ApiProperty({ type: String, description: 'Reference ID' })
  @IsNotEmpty()
  @IsString()
  channelId: string;

  @ApiProperty({ type: String, description: 'Reference ID' })
  @IsNotEmpty()
  @IsString()
  customerTypeId: string;

  @ApiProperty({ type: String, description: 'Reference ID' })
  @IsNotEmpty()
  @IsString()
  marketId: string;

  @ApiProperty({ type: String, description: 'Reference ID' })
  @IsNotEmpty()
  @IsString()
  provinceId: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  ownerName: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  phoneNumber: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  creditLimit: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  outstanding: number;

  @ApiPropertyOptional({
    type: () => GeoTagDto,
    description: 'Embedded GeoTag object',
  })
  @ValidateNested()
  @Type(() => GeoTagDto)
  geoTag?: GeoTagDto;

  /**
   * Status
   * ------
   * Reference of customer category
   */
  @ApiPropertyOptional({ enum: CustomerStatus, example: CustomerStatus.ACTIVE })
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;
}
