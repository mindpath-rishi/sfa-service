/**
 * StockSales Controller
 * ----------------------
 * Purpose : Exposes APIs for managing stock-saless
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create stock-saless
 * - Fetch stock-saless with filters & pagination
 * - Retrieve individual stock-sales details
 * - Update stock-sales
 * - Soft delete stock-saless
 *
 * Notes:
 * - StockSaless act as master reference data
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

import { StockSalesService } from './stock-sales.service';
import { CreateStockSalesDto } from './dto/create-stock-sales.dto';
import { UpdateStockSalesDto } from './dto/update-stock-sales.dto';
import { StockSalesQueryDto } from './dto/stock-sales-query.dto';
import { STOCK_SALES } from './stock-sales.constants';

@ApiTags('Stock Sales')
@FeatureFlag(API_MODULE_ENABLE_KEYS.STOCK_SALES)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.STOCK_SALES,
  version: V1,
})
export class StockSalesController {
  constructor(private readonly service: StockSalesService) {}

  /**
   * Create StockSales
   * -----------------
   */
  @Permissions('STOCK_SALES_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create stock-sales' })
  @ApiBody({ type: CreateStockSalesDto })
  @ApiSuccessResponse(
    { stockSalesId: 'STOC-001' },
    STOCK_SALES.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateStockSalesDto) {
    return this.service.create(dto);
  }

  /**
   * Get StockSaless
   * ---------------
   */
  @Get()
  @Permissions('STOCK_SALES_VIEW')
  async findAll(@Query() query: StockSalesQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get StockSales by ID
   * --------------------
   */
  @Permissions('STOCK_SALES_VIEW')
  @Get(':stockSalesId')
  @ApiParam({ name: 'stockSalesId', description: 'StockSales stockSalesId' })
  async findOne(@Param('stockSalesId') stockSalesId: string) {
    return this.service.findByStockSalesId(stockSalesId);
  }

  /**
   * Update StockSales
   * ------------------
   */
  @Permissions('STOCK_SALES_UPDATE')
  @Patch(':stockSalesId')
  @ApiParam({ name: 'stockSalesId', description: 'StockSales stockSalesId' })
  async update(
    @Param('stockSalesId') stockSalesId: string,
    @Body() dto: UpdateStockSalesDto,
  ) {
    return this.service.update(stockSalesId, dto);
  }

  /**
   * Delete StockSales
   * ------------------
   */
  @Permissions('STOCK_SALES_DELETE')
  @Delete(':stockSalesId')
  @ApiParam({ name: 'stockSalesId', description: 'StockSales stockSalesId' })
  async delete(@Param('stockSalesId') stockSalesId: string) {
    return this.service.delete(stockSalesId);
  }
}
