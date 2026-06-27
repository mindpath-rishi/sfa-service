import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { RouteCustomerMappingStatus } from 'src/shared/enums/route-customer-mapping.enums';

export class UpdateRouteCustomerMappingDto {
  /**
   * UpdateRouteCustomerMappingDto
   * =================
   * Data Transfer Object for updating RouteCustomerMapping records
   *
   * All fields are optional for partial updates
   * Supports partial updates - omitted fields will retain their existing values
   */
  @ApiPropertyOptional({ type: String, description: 'Array of Reference IDs' })
  @IsOptional()
  @IsString()
  routeId?: string;

  @ApiPropertyOptional({ type: String, description: 'Array of Reference IDs' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Min(1)
  sequence?: number;

  @ApiPropertyOptional({
    enum: RouteCustomerMappingStatus,
    default: RouteCustomerMappingStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(RouteCustomerMappingStatus)
  status?: RouteCustomerMappingStatus;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  effectiveFrom?: Date;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  effectiveTo?: Date;
}
