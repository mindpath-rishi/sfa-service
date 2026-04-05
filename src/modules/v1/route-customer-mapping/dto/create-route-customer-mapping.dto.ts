
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Days, RouteCustomerMappingStatus } from 'src/shared/enums/route-customer-mapping.enums';


export class CreateRouteCustomerMappingDto {
/**
 * CreateRouteCustomerMappingDto
 * =================
 * Data Transfer Object for creating new RouteCustomerMapping records
 */
  @ApiProperty({ type: String, description: 'Business identifier for Reference' })
  @IsNotEmpty()
  @IsString()
  routeId: string;

  @ApiProperty({ type: String, description: 'Business identifier for Reference' })
  @IsNotEmpty()
  @IsString()
  customerId: string;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  sequence: number;

  @ApiProperty({ enum: Days, description: 'Day of the week for the route-customer mapping' })
  @IsNotEmpty()
  @IsEnum(Days)
  day: Days;

  @ApiPropertyOptional({ type: Date  })
  @IsOptional()
  @IsDate()
  effectiveFrom?: Date;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  effectiveTo?: Date;

}
