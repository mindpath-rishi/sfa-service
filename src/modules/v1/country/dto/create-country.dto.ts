import { CountryStatus } from 'src/shared/enums/country.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';

export class CreateCountryDto {
/**
 * Country Create DTO
 * ====================
 * Data Transfer Object for creating new Country records
 */
  /**
   * Name
   * ----
   * Display name of country
   */

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string;
  /**
   * Status
   * ------
   * Country availability status
   */

  @ApiPropertyOptional({ example: CountryStatus.ACTIVE, enum: CountryStatus })
  @IsOptional()
  @IsEnum(CountryStatus)
  status?: CountryStatus;

}
