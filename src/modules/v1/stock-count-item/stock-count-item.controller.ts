/**
 * StockCountItem Controller
 * --------------------------
 * Purpose : Exposes APIs for managing stock-count-items
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create stock-count-items
 * - Fetch stock-count-items with filters & pagination
 * - Retrieve individual stock-count-item details
 * - Update stock-count-item
 * - Soft delete stock-count-items
 *
 * Notes:
 * - StockCountItems act as master reference data
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

import { StockCountItemService } from './stock-count-item.service';
import { CreateStockCountItemDto } from './dto/create-stock-count-item.dto';
import { UpdateStockCountItemDto } from './dto/update-stock-count-item.dto';
import { StockCountItemQueryDto } from './dto/stock-count-item-query.dto';
import { STOCK_COUNT_ITEM } from './stock-count-item.constants';

@ApiTags('Stock Count Item')
@FeatureFlag(API_MODULE_ENABLE_KEYS.STOCK_COUNT_ITEM)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.STOCK_COUNT_ITEM,
  version: V1,
})
export class StockCountItemController {
  constructor(private readonly service: StockCountItemService) {}

  /**
   * Create StockCountItem
   * ---------------------
   */
  @Permissions('STOCK_COUNT_ITEM_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create stock-count-item' })
  @ApiBody({ type: CreateStockCountItemDto })
  @ApiSuccessResponse(
    { stockCountId: 'STOC-001' },
    STOCK_COUNT_ITEM.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateStockCountItemDto) {
    return this.service.create(dto);
  }

  /**
   * Get StockCountItems
   * -------------------
   */
  @Get()
  @Permissions('STOCK_COUNT_ITEM_VIEW')
  async findAll(@Query() query: StockCountItemQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get StockCountItem by ID
   * ------------------------
   */
  @Permissions('STOCK_COUNT_ITEM_VIEW')
  @Get(':stockCountId')
  @ApiParam({
    name: 'stockCountId',
    description: 'StockCountItem stockCountId',
  })
  async findOne(@Param('stockCountId') stockCountId: string) {
    return this.service.findByStockCountId(stockCountId);
  }

  /**
   * Update StockCountItem
   * ----------------------
   */
  @Permissions('STOCK_COUNT_ITEM_UPDATE')
  @Patch(':stockCountId')
  @ApiParam({
    name: 'stockCountId',
    description: 'StockCountItem stockCountId',
  })
  async update(
    @Param('stockCountId') stockCountId: string,
    @Body() dto: UpdateStockCountItemDto,
  ) {
    return this.service.update(stockCountId, dto);
  }

  /**
   * Delete StockCountItem
   * ----------------------
   */
  @Permissions('STOCK_COUNT_ITEM_DELETE')
  @Delete(':stockCountId')
  @ApiParam({
    name: 'stockCountId',
    description: 'StockCountItem stockCountId',
  })
  async delete(@Param('stockCountId') stockCountId: string) {
    return this.service.delete(stockCountId);
  }
}
