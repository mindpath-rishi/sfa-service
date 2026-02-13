
/**
 * Country Controller
 * -------------------
 * Purpose : Exposes APIs for managing countrys
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create countrys
 * - Fetch countrys with filters & pagination
 * - Retrieve individual country details
 * - Update countrys
 * - Soft delete countrys
 *
 * Notes:
 * - Countrys act as master reference data
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { FeatureFlag } from 'src/core/decorators/feature-flag.decorator';
import { ApiSuccessResponse } from 'src/core/swagger/api.response.swagger';
import {
  ApiInternalErrorResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from 'src/core/swagger/api-error.response.swagger';

import {
  API_MODULE,
  API_MODULE_ENABLE_KEYS,
  V1,
} from 'src/shared/constants/api.constants';

import { Permissions } from 'src/core/decorators/permission.decorator';

import { CountryService } from './country.service';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { CountryQueryDto } from './dto/country-query.dto';
import { COUNTRY } from './country.constants';

@ApiTags('Country')
@FeatureFlag(API_MODULE_ENABLE_KEYS.COUNTRY)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.COUNTRY,
  version: V1,
})
export class CountryController {
  constructor(private readonly service: CountryService) {}

  /**
   * Create Country
   * --------------
   */
  @Permissions('COUNTRY_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create country' })
  @ApiBody({ type: CreateCountryDto })
  @ApiSuccessResponse(
    { countryId: 'COUN-001' },
    COUNTRY.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateCountryDto) {
    return this.service.create(dto);
  }

  /**
   * Get Countrys
   * ------------
   */
  @Get()
  @Permissions('COUNTRY_VIEW')
  async findAll(@Query() query: CountryQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get Country by ID
   * -----------------
   */
  @Permissions('COUNTRY_VIEW')
  @Get(':countryId')
  @ApiParam({ name: 'countryId' })
  async findOne(@Param('countryId') countryId: string) {
    return this.service.findByCountryId(countryId);
  }

  /**
   * Update Country
   * ---------------
   */
  @Permissions('COUNTRY_UPDATE')
  @Patch(':countryId')
  async update(
    @Param('countryId') countryId: string,
    @Body() dto: UpdateCountryDto,
  ) {
    return this.service.update(countryId, dto);
  }

  /**
   * Delete Country
   * ---------------
   */
  @Permissions('COUNTRY_DELETE')
  @Delete(':countryId')
  async delete(@Param('countryId') countryId: string) {
    return this.service.delete(countryId);
  }
}
