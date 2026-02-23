/**
 * VanDailyStock Controller
 * -------------------------
 * Purpose : Exposes APIs for managing van-daily-stocks
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create van-daily-stocks
 * - Fetch van-daily-stocks with filters & pagination
 * - Retrieve individual van-daily-stock details
 * - Update van-daily-stock
 * - Soft delete van-daily-stocks
 *
 * Notes:
 * - VanDailyStocks act as master reference data
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

import { VanDailyStockService } from './van-daily-stock.service';
import { CreateVanDailyStockDto } from './dto/create-van-daily-stock.dto';
import { UpdateVanDailyStockDto } from './dto/update-van-daily-stock.dto';
import { VanDailyStockQueryDto } from './dto/van-daily-stock-query.dto';
import { VAN_DAILY_STOCK } from './van-daily-stock.constants';

@ApiTags('Van-daily-stock')
@FeatureFlag(API_MODULE_ENABLE_KEYS.VAN_DAILY_STOCK)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.VAN_DAILY_STOCK,
  version: V1,
})
export class VanDailyStockController {
  constructor(private readonly service: VanDailyStockService) {}

  /**
   * Create VanDailyStock
   * --------------------
   */
  @Permissions('VAN_DAILY_STOCK_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create van-daily-stock' })
  @ApiBody({ type: CreateVanDailyStockDto })
  @ApiSuccessResponse(
    { vanDailyStockId: 'VAN_-001' },
    VAN_DAILY_STOCK.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateVanDailyStockDto) {
    return this.service.create(dto);
  }

  /**
   * Get VanDailyStocks
   * ------------------
   */
  @Get()
  @Permissions('VAN_DAILY_STOCK_VIEW')
  async findAll(@Query() query: VanDailyStockQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get VanDailyStock by ID
   * -----------------------
   */
  @Permissions('VAN_DAILY_STOCK_VIEW')
  @Get(':vanDailyStockId')
  @ApiParam({ name: 'vanDailyStockId', description: 'VanDailyStock vanDailyStockId' })
  async findOne(@Param('vanDailyStockId') vanDailyStockId: string) {
    return this.service.findByVanDailyStockId(vanDailyStockId);
  }

  /**
   * Update VanDailyStock
   * ---------------------
   */
  @Permissions('VAN_DAILY_STOCK_UPDATE')
  @Patch(':vanDailyStockId')
  @ApiParam({ name: 'vanDailyStockId', description: 'VanDailyStock vanDailyStockId' })
  async update(
    @Param('vanDailyStockId') vanDailyStockId: string,
    @Body() dto: UpdateVanDailyStockDto,
  ) {
    return this.service.update(vanDailyStockId, dto);
  }

  /**
   * Delete VanDailyStock
   * ---------------------
   */
  @Permissions('VAN_DAILY_STOCK_DELETE')
  @Delete(':vanDailyStockId')
  @ApiParam({ name: 'vanDailyStockId', description: 'VanDailyStock vanDailyStockId' })
  async delete(@Param('vanDailyStockId') vanDailyStockId: string) {
    return this.service.delete(vanDailyStockId);
  }
}
