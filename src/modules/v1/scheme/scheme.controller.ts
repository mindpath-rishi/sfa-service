/**
 * Scheme Controller
 * ------------------
 * Purpose : Exposes APIs for managing sales promotion schemes
 * Used by : MIS / MOBILE
 *
 * Responsibilities:
 * - Create schemes
 * - Fetch schemes with filters & pagination
 * - Retrieve individual scheme details
 * - Update scheme
 * - Soft delete scheme
 * - Resolve schemes applicable to a product/geography at sale time
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
import { Permissions } from 'src/core/decorators/permission.decorator';
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

import { SchemeService } from './scheme.service';
import { CreateSchemeDto } from './dto/create-scheme.dto';
import { UpdateSchemeDto } from './dto/update-scheme.dto';
import { SchemeQueryDto } from './dto/scheme-query.dto';
import { ApplicableSchemeQueryDto } from './dto/applicable-scheme-query.dto';
import { SCHEME } from './scheme.constants';

@ApiTags('Scheme')
@FeatureFlag(API_MODULE_ENABLE_KEYS.SCHEME)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.SCHEME,
  version: V1,
})
export class SchemeController {
  constructor(private readonly service: SchemeService) {}

  /**
   * Create Scheme
   * -------------
   */
  @Permissions('SCHEME_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create scheme' })
  @ApiBody({ type: CreateSchemeDto })
  @ApiSuccessResponse(
    { schemeId: 'SCHM-001' },
    SCHEME.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateSchemeDto) {
    return this.service.create(dto);
  }

  /**
   * Get Schemes
   * -----------
   */
  @Permissions('SCHEME_VIEW')
  @Get()
  @ApiOperation({ summary: 'List schemes' })
  async findAll(@Query() query: SchemeQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get Applicable Schemes
   * ----------------------
   * Resolves the schemes that apply to a product/geography at sale time.
   */
  @Get('applicable')
  @ApiOperation({
    summary: 'Get schemes applicable to a product and geography',
  })
  async findApplicable(@Query() query: ApplicableSchemeQueryDto) {
    const data = await this.service.findApplicableSchemes(query);

    return {
      statusCode: HttpStatus.OK,
      message: SCHEME.FETCHED,
      data,
    };
  }

  /**
   * Get Scheme by ID
   * ----------------
   */
  @Permissions('SCHEME_VIEW')
  @Get(':schemeId')
  @ApiParam({ name: 'schemeId', description: 'Scheme schemeId' })
  async findOne(@Param('schemeId') schemeId: string) {
    return this.service.findBySchemeId(schemeId);
  }

  /**
   * Update Scheme
   * -------------
   */
  @Permissions('SCHEME_UPDATE')
  @Patch(':schemeId')
  @ApiParam({ name: 'schemeId', description: 'Scheme schemeId' })
  async update(
    @Param('schemeId') schemeId: string,
    @Body() dto: UpdateSchemeDto,
  ) {
    return this.service.update(schemeId, dto);
  }

  /**
   * Delete Scheme
   * -------------
   */
  @Permissions('SCHEME_DELETE')
  @Delete(':schemeId')
  @ApiParam({ name: 'schemeId', description: 'Scheme schemeId' })
  async delete(@Param('schemeId') schemeId: string) {
    return this.service.delete(schemeId);
  }
}
