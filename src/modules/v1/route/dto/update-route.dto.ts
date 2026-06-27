import { RouteStatus } from 'src/shared/enums/route.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';


export class UpdateRouteCustomerDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  sequence?: number;

}

export class UpdateRouteDto {
/**
 * UpdateRouteDto
 * =================
 * Data Transfer Object for updating Route records
 * 
 * All fields are optional for partial updates
 * Supports partial updates - omitted fields will retain their existing values
 */
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  countryId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  customerCategoryId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  provinceId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  marketId?: string;

  @ApiPropertyOptional({ type: () => [UpdateRouteCustomerDto], description: 'Update mapped outlets array' , default: [] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRouteCustomerDto)
  associatedCustomers?: UpdateRouteCustomerDto[];

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  outletCount?: number;

  @ApiPropertyOptional({ enum: RouteStatus, default: RouteStatus.ACTIVE })
  @IsOptional()
  @IsEnum(RouteStatus)
  status?: RouteStatus;

}
