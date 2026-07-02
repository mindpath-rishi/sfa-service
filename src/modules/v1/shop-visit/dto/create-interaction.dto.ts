import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { LocationPointDto } from 'src/shared/dto/location-point.dto';

export class CreateInteractionDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsString()
  @IsNotEmpty()
  routeSessionId!: string;

  @IsString()
  @IsNotEmpty()
  workSessionId!: string;

  @IsString()
  @IsNotEmpty()
  vanId!: string;

  @ValidateNested()
  @Type(() => LocationPointDto)
  salesmanLocation!: LocationPointDto;

  /**
   * @deprecated Customer GPS is read from customer master data.
   * Kept temporarily so older mobile clients are not rejected by the
   * global forbidNonWhitelisted validation setting.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationPointDto)
  customerLocation?: LocationPointDto;

  /** @deprecated The server uses CUSTOMER_GEOFENCE_RADIUS_METERS. */
  @IsOptional()
  @IsNumber()
  configuredRadiusMeters?: number;
}
