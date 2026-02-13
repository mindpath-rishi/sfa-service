/**
 * StockSalesItem Controller
 * --------------------------
 * Purpose : Exposes APIs for managing stock-sales-items
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create stock-sales-items
 * - Fetch stock-sales-items with filters & pagination
 * - Retrieve individual stock-sales-item details
 * - Update stock-sales-item
 * - Soft delete stock-sales-items
 *
 * Notes:
 * - StockSalesItems act as master reference data
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

import { StockSalesItemService } from './stock-sales-item.service';
import { CreateStockSalesItemDto } from './dto/create-stock-sales-item.dto';
import { UpdateStockSalesItemDto } from './dto/update-stock-sales-item.dto';
import { StockSalesItemQueryDto } from './dto/stock-sales-item-query.dto';
import { STOCK_SALES_ITEM } from './stock-sales-item.constants';

@ApiTags('Stock Sales Item')
@FeatureFlag(API_MODULE_ENABLE_KEYS.STOCK_SALES_ITEM)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.STOCK_SALES_ITEM,
  version: V1,
})
export class StockSalesItemController {
  constructor(private readonly service: StockSalesItemService) {}

  /**
   * Create StockSalesItem
   * ---------------------
   */
  @Permissions('STOCK_SALES_ITEM_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create stock-sales-item' })
  @ApiBody({ type: CreateStockSalesItemDto })
  @ApiSuccessResponse(
    { stockSalesId: 'STOC-001' },
    STOCK_SALES_ITEM.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateStockSalesItemDto) {
    return this.service.create(dto);
  }

  /**
   * Get StockSalesItems
   * -------------------
   */
  @Get()
  @Permissions('STOCK_SALES_ITEM_VIEW')
  async findAll(@Query() query: StockSalesItemQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get StockSalesItem by ID
   * ------------------------
   */
  @Permissions('STOCK_SALES_ITEM_VIEW')
  @Get(':stockSalesId')
  @ApiParam({ name: 'stockSalesId', description: 'StockSalesItem stockSalesId' })
  async findOne(@Param('stockSalesId') stockSalesId: string) {
    return this.service.findByStockSalesId(stockSalesId);
  }

  /**
   * Update StockSalesItem
   * ----------------------
   */
  @Permissions('STOCK_SALES_ITEM_UPDATE')
  @Patch(':stockSalesId')
  @ApiParam({ name: 'stockSalesId', description: 'StockSalesItem stockSalesId' })
  async update(
    @Param('stockSalesId') stockSalesId: string,
    @Body() dto: UpdateStockSalesItemDto,
  ) {
    return this.service.update(stockSalesId, dto);
  }

  /**
   * Delete StockSalesItem
   * ----------------------
   */
  @Permissions('STOCK_SALES_ITEM_DELETE')
  @Delete(':stockSalesId')
  @ApiParam({ name: 'stockSalesId', description: 'StockSalesItem stockSalesId' })
  async delete(@Param('stockSalesId') stockSalesId: string) {
    return this.service.delete(stockSalesId);
  }
}
