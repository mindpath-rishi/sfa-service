import { CustomerStatus } from 'src/shared/enums/customer.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
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

export class CreateCustomerDto {
/**
 * Customer Create DTO
 * ====================
 * Data Transfer Object for creating new Customer records
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
  outletTypeId: string;

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
  outletName: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  address: string;

  @ApiPropertyOptional({ type: () => GeoTagDto, description: 'Embedded GeoTag object' })
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
