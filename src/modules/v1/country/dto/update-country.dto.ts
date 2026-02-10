import { CountryStatus } from 'src/shared/enums/country.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';

export class UpdateCountryDto {
/**
 * Country Update DTO
 * ====================
 * Data Transfer Object for updating Country records
 * 
 * All fields are optional for partial updates
 */
  /**
   * Name
   * ----
   * Display name of country
   */

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;
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
