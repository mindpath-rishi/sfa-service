import { RouteStatus } from 'src/shared/enums/route.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';


export class RouteCustomerDto {
  @ApiProperty({ type: String, description: 'Business identifier for customer' })
  @IsNotEmpty()
  @IsString()
  customerId: string;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  sequence: number;

}

export class CreateRouteDto {
/**
 * CreateRouteDto
 * =================
 * Data Transfer Object for creating new Route records
 */
  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ type: String, description: 'Business identifier for beat' })
  @IsNotEmpty()
  @IsString()
  beatId: string;

  @ApiPropertyOptional({ type: () => [RouteCustomerDto], description: 'Embedded RouteCustomer array' , default: [] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => RouteCustomerDto)
  associatedCustomers?: RouteCustomerDto[];

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  day: string;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  distance?: number;

  @ApiPropertyOptional({ enum: RouteStatus, default: RouteStatus.ACTIVE })
  @IsOptional()
  @IsEnum(RouteStatus)
  status?: RouteStatus;

}
