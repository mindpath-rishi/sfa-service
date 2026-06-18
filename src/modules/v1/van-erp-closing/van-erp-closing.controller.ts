/**
 * VanErpClosing Controller
 * -------------------------
 * Purpose : Exposes APIs for managing van-erp-closings
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create van-erp-closings
 * - Fetch van-erp-closings with filters & pagination
 * - Retrieve individual van-erp-closing details
 * - Update van-erp-closing
 * - Soft delete van-erp-closings
 *
 * Notes:
 * - VanErpClosings act as master reference data
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

import { VanErpClosingService } from './van-erp-closing.service';
import { CreateVanErpClosingDto } from './dto/create-van-erp-closing.dto';
import { UpdateVanErpClosingDto } from './dto/update-van-erp-closing.dto';
import { VanErpClosingQueryDto } from './dto/van-erp-closing-query.dto';
import { VAN_ERP_CLOSING } from './van-erp-closing.constants';
import { Public } from 'src/core/decorators/public.decorator';

@ApiTags('Van-erp-closing')
@FeatureFlag(API_MODULE_ENABLE_KEYS.VAN_ERP_CLOSING)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.VAN_ERP_CLOSING,
  version: V1,
})
export class VanErpClosingController {
  constructor(private readonly service: VanErpClosingService) {}

  /**
   * Create VanErpClosing
   * --------------------
   */
  @Permissions('VAN_ERP_CLOSING_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create van-erp-closing' })
  @ApiBody({ type: CreateVanErpClosingDto })
  @ApiSuccessResponse(
    { stockId: 'VAN_-001' },
    VAN_ERP_CLOSING.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateVanErpClosingDto) {
    return this.service.create(dto);
  }

  @Public()
  @Permissions('VAN_ERP_CLOSING_CREATE')
  @Post('sync')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create van-erp-closing' })
  @ApiBody({ type: CreateVanErpClosingDto })
  @ApiSuccessResponse(
    { stockId: 'VAN_-001' },
    VAN_ERP_CLOSING.CREATED,
    HttpStatus.CREATED,
  )
  async sync() {
    return this.service.syncVanClosingStockFromERP();
  }

  /**
   * Get VanErpClosings
   * ------------------
   */
  @Get()
  @Permissions('VAN_ERP_CLOSING_VIEW')
  async findAll(@Query() query: VanErpClosingQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get VanErpClosing by ID
   * -----------------------
   */
  @Permissions('VAN_ERP_CLOSING_VIEW')
  @Get(':stockId')
  @ApiParam({ name: 'stockId', description: 'VanErpClosing stockId' })
  async findOne(@Param('stockId') stockId: string) {
    return this.service.findByStockId(stockId);
  }

  /**
   * Update VanErpClosing
   * ---------------------
   */
  @Permissions('VAN_ERP_CLOSING_UPDATE')
  @Patch(':stockId')
  @ApiParam({ name: 'stockId', description: 'VanErpClosing stockId' })
  async update(
    @Param('stockId') stockId: string,
    @Body() dto: UpdateVanErpClosingDto,
  ) {
    return this.service.update(stockId, dto);
  }

  /**
   * Delete VanErpClosing
   * ---------------------
   */
  @Permissions('VAN_ERP_CLOSING_DELETE')
  @Delete(':stockId')
  @ApiParam({ name: 'stockId', description: 'VanErpClosing stockId' })
  async delete(@Param('stockId') stockId: string) {
    return this.service.delete(stockId);
  }
}
