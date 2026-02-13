import { RouteStatus } from 'src/shared/enums/route.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';


export class UpdateRouteCustomerDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
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
  beatId?: string;

  @ApiPropertyOptional({ type: () => [UpdateRouteCustomerDto], description: 'Update embedded RouteCustomer array' , default: [] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => UpdateRouteCustomerDto)
  associatedCustomers?: UpdateRouteCustomerDto[];

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  day?: string;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  distance?: number;

  @ApiPropertyOptional({ enum: RouteStatus, default: RouteStatus.ACTIVE })
  @IsOptional()
  @IsEnum(RouteStatus)
  status?: RouteStatus;

}
