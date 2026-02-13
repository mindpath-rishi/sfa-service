
/**
 * Province Controller
 * --------------------
 * Purpose : Exposes APIs for managing provinces
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create provinces
 * - Fetch provinces with filters & pagination
 * - Retrieve individual province details
 * - Update provinces
 * - Soft delete provinces
 *
 * Notes:
 * - Provinces act as master reference data
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

import { ProvinceService } from './province.service';
import { CreateProvinceDto } from './dto/create-province.dto';
import { UpdateProvinceDto } from './dto/update-province.dto';
import { ProvinceQueryDto } from './dto/province-query.dto';
import { PROVINCE } from './province.constants';

@ApiTags('Province')
@FeatureFlag(API_MODULE_ENABLE_KEYS.PROVINCE)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.PROVINCE,
  version: V1,
})
export class ProvinceController {
  constructor(private readonly service: ProvinceService) {}

  /**
   * Create Province
   * ---------------
   */
  @Permissions('PROVINCE_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create province' })
  @ApiBody({ type: CreateProvinceDto })
  @ApiSuccessResponse(
    { provinceId: 'PROV-001' },
    PROVINCE.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateProvinceDto) {
    return this.service.create(dto);
  }

  /**
   * Get Provinces
   * -------------
   */
  @Get()
  @Permissions('PROVINCE_VIEW')
  async findAll(@Query() query: ProvinceQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get Province by ID
   * ------------------
   */
  @Permissions('PROVINCE_VIEW')
  @Get(':provinceId')
  @ApiParam({ name: 'provinceId' })
  async findOne(@Param('provinceId') provinceId: string) {
    return this.service.findByProvinceId(provinceId);
  }

  /**
   * Update Province
   * ----------------
   */
  @Permissions('PROVINCE_UPDATE')
  @Patch(':provinceId')
  async update(
    @Param('provinceId') provinceId: string,
    @Body() dto: UpdateProvinceDto,
  ) {
    return this.service.update(provinceId, dto);
  }

  /**
   * Delete Province
   * ----------------
   */
  @Permissions('PROVINCE_DELETE')
  @Delete(':provinceId')
  async delete(@Param('provinceId') provinceId: string) {
    return this.service.delete(provinceId);
  }
}
