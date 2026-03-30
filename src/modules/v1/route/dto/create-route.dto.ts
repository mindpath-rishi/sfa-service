import { RouteStatus } from 'src/shared/enums/route.enums';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  ArrayNotEmpty,
  IsArray,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * ✅ Day Enum (recommended)
 */
export enum RouteDay {
  MON = 'MON',
  TUE = 'TUE',
  WED = 'WED',
  THU = 'THU',
  FRI = 'FRI',
  SAT = 'SAT',
  SUN = 'SUN',
}

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
  customerId: string;

  @ApiProperty({ type: Number, description: 'Visit sequence order' })
  @IsNotEmpty()
  @Type(() => Number) // ✅ FIX string → number
  @IsNumber()
  @Min(1)
  sequence: number;
}

/* ======================================================
 * CREATE ROUTE DTO
 * ====================================================== */

export class CreateRouteDto {
  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({
    type: String,
    description: 'Business identifier for beat',
  })
  @IsNotEmpty()
  @IsString()
  beatId: string;

  /**
   * ✅ Customers Array
   */
  @ApiPropertyOptional({
    type: () => [RouteCustomerDto],
    description: 'List of customers with sequence',
    default: [],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteCustomerDto)
  associatedCustomers?: RouteCustomerDto[];

  /**
   * ✅ Day Validation (ENUM)
   */
  @ApiProperty({
    enum: RouteDay,
    description: 'Route day of execution',
  })
  @IsNotEmpty()
  @IsEnum(RouteDay)
  day: RouteDay;

  /**
   * ✅ Distance
   */
  @ApiPropertyOptional({
    type: Number,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  distance?: number;

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