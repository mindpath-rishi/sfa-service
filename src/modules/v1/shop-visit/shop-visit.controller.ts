/**
 * ShopVisit Controller
 * ---------------------
 * Purpose : Exposes APIs for managing shop-visits
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create shop-visits
 * - Fetch shop-visits with filters & pagination
 * - Retrieve individual shop-visit details
 * - Update shop-visit
 * - Soft delete shop-visits
 *
 * Notes:
 * - ShopVisits act as master reference data
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

import { ShopVisitService } from './shop-visit.service';
import { CreateShopVisitDto } from './dto/create-shop-visit.dto';
import { UpdateShopVisitDto } from './dto/update-shop-visit.dto';
import { ShopVisitQueryDto, ShopVisitStatusQueryDto } from './dto/shop-visit-query.dto';
import { SHOP_VISIT } from './shop-visit.constants';

@ApiTags('Shop-visit')
@FeatureFlag(API_MODULE_ENABLE_KEYS.SHOP_VISIT)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.SHOP_VISIT,
  version: V1,
})
export class ShopVisitController {
  constructor(private readonly service: ShopVisitService) {}

  /**
   * Create ShopVisit
   * ----------------
   */
  @Permissions('SHOP_VISIT_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create shop-visit' })
  @ApiBody({ type: CreateShopVisitDto })
  @ApiSuccessResponse(
    { visitId: 'SHOP-001' },
    SHOP_VISIT.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateShopVisitDto) {
    return this.service.create(dto);
  }

  /**
   * Get ShopVisits
   * --------------
   */
  @Get()
  @Permissions('SHOP_VISIT_VIEW')
  async findAll(@Query() query: ShopVisitQueryDto) {
    return this.service.findAll(query);
  }


    /**
   * Get ShopVisits Status
   * --------------
   */
  @Get('status')
  @Permissions('SHOP_VISIT_VIEW')
  async status(@Query() query: ShopVisitStatusQueryDto) {
    return this.service.status(query);
  }


  /**
   * Get ShopVisit by ID
   * -------------------
   */
  @Permissions('SHOP_VISIT_VIEW')
  @Get(':visitId')
  @ApiParam({ name: 'visitId', description: 'ShopVisit visitId' })
  async findOne(@Param('visitId') visitId: string) {
    return this.service.findByVisitId(visitId);
  }

  /**
   * Update ShopVisit
   * -----------------
   */
  @Permissions('SHOP_VISIT_UPDATE')
  @Patch(':visitId')
  @ApiParam({ name: 'visitId', description: 'ShopVisit visitId' })
  async update(
    @Param('visitId') visitId: string,
    @Body() dto: UpdateShopVisitDto,
  ) {
    return this.service.update(visitId, dto);
  }

  /**
   * Delete ShopVisit
   * -----------------
   */
  @Permissions('SHOP_VISIT_DELETE')
  @Delete(':visitId')
  @ApiParam({ name: 'visitId', description: 'ShopVisit visitId' })
  async delete(@Param('visitId') visitId: string) {
    return this.service.delete(visitId);
  }
}
