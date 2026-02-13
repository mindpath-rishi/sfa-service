/**
 * StockCount Controller
 * ----------------------
 * Purpose : Exposes APIs for managing stock-counts
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create stock-counts
 * - Fetch stock-counts with filters & pagination
 * - Retrieve individual stock-count details
 * - Update stock-count
 * - Soft delete stock-counts
 *
 * Notes:
 * - StockCounts act as master reference data
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

import { StockCountService } from './stock-count.service';
import { CreateStockCountDto } from './dto/create-stock-count.dto';
import { UpdateStockCountDto } from './dto/update-stock-count.dto';
import { StockCountQueryDto } from './dto/stock-count-query.dto';
import { STOCK_COUNT } from './stock-count.constants';

@ApiTags('Stock-count')
@FeatureFlag(API_MODULE_ENABLE_KEYS.STOCK_COUNT)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.STOCK_COUNT,
  version: V1,
})
export class StockCountController {
  constructor(private readonly service: StockCountService) {}

  /**
   * Create StockCount
   * -----------------
   */
  @Permissions('STOCK_COUNT_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create stock-count' })
  @ApiBody({ type: CreateStockCountDto })
  @ApiSuccessResponse(
    { stockCountId: 'STOC-001' },
    STOCK_COUNT.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateStockCountDto) {
    return this.service.create(dto);
  }

  /**
   * Get StockCounts
   * ---------------
   */
  @Get()
  @Permissions('STOCK_COUNT_VIEW')
  async findAll(@Query() query: StockCountQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get StockCount by ID
   * --------------------
   */
  @Permissions('STOCK_COUNT_VIEW')
  @Get(':stockCountId')
  @ApiParam({ name: 'stockCountId', description: 'StockCount stockCountId' })
  async findOne(@Param('stockCountId') stockCountId: string) {
    return this.service.findByStockCountId(stockCountId);
  }

  /**
   * Update StockCount
   * ------------------
   */
  @Permissions('STOCK_COUNT_UPDATE')
  @Patch(':stockCountId')
  @ApiParam({ name: 'stockCountId', description: 'StockCount stockCountId' })
  async update(
    @Param('stockCountId') stockCountId: string,
    @Body() dto: UpdateStockCountDto,
  ) {
    return this.service.update(stockCountId, dto);
  }

  /**
   * Delete StockCount
   * ------------------
   */
  @Permissions('STOCK_COUNT_DELETE')
  @Delete(':stockCountId')
  @ApiParam({ name: 'stockCountId', description: 'StockCount stockCountId' })
  async delete(@Param('stockCountId') stockCountId: string) {
    return this.service.delete(stockCountId);
  }
}
