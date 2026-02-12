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
 * Route Update DTO
 * ====================
 * Data Transfer Object for updating Route records
 * 
 * All fields are optional for partial updates
 */
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  beatId?: string;

  @ApiPropertyOptional({ type: () => [UpdateRouteCustomerDto], description: 'Update embedded RouteCustomer array' })
  @IsOptional()
  @ValidateNested({ each: true })
  @ValidateNested({ each: true })
  @Type(() => UpdateRouteCustomerDto)
  associatedCustomers?: UpdateRouteCustomerDto[];

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  day?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  distance?: number;

  @ApiPropertyOptional({ enum: RouteStatus, example: RouteStatus.ACTIVE })
  @IsOptional()
  @IsEnum(RouteStatus)
  status?: RouteStatus;

}
