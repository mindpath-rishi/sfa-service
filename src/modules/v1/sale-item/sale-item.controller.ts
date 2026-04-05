/**
 * SalesItem Controller
 * ---------------------
 * Purpose : Exposes APIs for managing sales-items
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create sales-items
 * - Fetch sales-items with filters & pagination
 * - Retrieve individual sales-item details
 * - Update sales-item
 * - Soft delete sales-items
 *
 * Notes:
 * - SalesItems act as master reference data
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
import { SaleItemService } from './sale-item.service';
import { CreateSaleItemDto } from './dto/create-sale-item.dto';
import { SALE_ITEM } from './sale-item.constants';
import { SaleItemQueryDto } from './dto/sale-item-query.dto';
import { UpdateSaleItemDto } from './dto/update-sale-item.dto';

@ApiTags('Sales-item')
@FeatureFlag(API_MODULE_ENABLE_KEYS.SALES_ITEM)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.SALES_ITEM,
  version: V1,
})
export class SaleItemController {
  constructor(private readonly service: SaleItemService) {}

  /**
   * Create SalesItem
   * ----------------
   */
  @Permissions('SALES_ITEM_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create sales-item' })
  @ApiBody({ type: CreateSaleItemDto })
  @ApiSuccessResponse(
    { saleId: 'SALE-001' },
    SALE_ITEM.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateSaleItemDto) {
    return this.service.create(dto);
  }

  /**
   * Get SalesItems
   * --------------
   */
  @Get()
  @Permissions('SALES_ITEM_VIEW')
  async findAll(@Query() query: SaleItemQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get SalesItem by ID
   * -------------------
   */
  @Permissions('SALES_ITEM_VIEW')
  @Get(':saleId')
  @ApiParam({ name: 'saleId', description: 'SalesItem saleId' })
  async findOne(@Param('saleId') saleId: string) {
    return this.service.findBySaleId(saleId);
  }

  /**
   * Update SalesItem
   * -----------------
   */
  @Permissions('SALES_ITEM_UPDATE')
  @Patch(':saleId')
  @ApiParam({ name: 'saleId', description: 'SalesItem saleId' })
  async update(
    @Param('saleId') saleId: string,
    @Body() dto: UpdateSaleItemDto,
  ) {
    return this.service.update(saleId, dto);
  }

  /**
   * Delete SalesItem
   * -----------------
   */
  @Permissions('SALES_ITEM_DELETE')
  @Delete(':saleId')
  @ApiParam({ name: 'saleId', description: 'SalesItem saleId' })
  async delete(@Param('saleId') saleId: string) {
    return this.service.delete(saleId);
  }
}
