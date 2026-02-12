import { RouteStatus } from 'src/shared/enums/route.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RouteCustomerDto {
  @ApiProperty({ type: String })
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
 * Route Create DTO
 * ====================
 * Data Transfer Object for creating new Route records
 */
  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  beatId: string;

  @ApiPropertyOptional({ type: () => [RouteCustomerDto], description: 'Embedded RouteCustomer array' })
  @ValidateNested({ each: true })
  @Type(() => RouteCustomerDto)
  associatedCustomers?: RouteCustomerDto[];

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  day: string;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  distance?: number;

  @ApiPropertyOptional({ enum: RouteStatus, example: RouteStatus.ACTIVE })
  @IsEnum(RouteStatus)
  status?: RouteStatus;

}
