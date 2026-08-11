
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';


export class CreateRouteCustomerMappingDto {
/**
 * CreateRouteCustomerMappingDto
 * =================
 * Data Transfer Object for creating new RouteCustomerMapping records
 */
  @ApiProperty({ type: String, description: 'Business identifier for Reference' })
  @IsNotEmpty()
  @IsString()
  routeId!: string;

  @ApiProperty({ type: String, description: 'Business identifier for Reference' })
  @IsNotEmpty()
  @IsString()
  customerId!: string;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  sequence!: number;

  @ApiPropertyOptional({ type: Date  })
  @IsOptional()
  @IsDate()
  effectiveFrom?: Date;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  effectiveTo?: Date;

}
