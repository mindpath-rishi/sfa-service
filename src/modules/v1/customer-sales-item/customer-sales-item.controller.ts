/**
 * CustomerSalesItem Controller
 * -----------------------------
 * Purpose : Exposes APIs for managing customer-sales-items
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create customer-sales-items
 * - Fetch customer-sales-items with filters & pagination
 * - Retrieve individual customer-sales-item details
 * - Update customer-sales-item
 * - Soft delete customer-sales-items
 *
 * Notes:
 * - CustomerSalesItems act as master reference data
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

import { CustomerSalesItemService } from './customer-sales-item.service';
import { CreateCustomerSalesItemDto } from './dto/create-customer-sales-item.dto';
import { UpdateCustomerSalesItemDto } from './dto/update-customer-sales-item.dto';
import { CustomerSalesItemQueryDto } from './dto/customer-sales-item-query.dto';
import { CUSTOMER_SALES_ITEM } from './customer-sales-item.constants';

@ApiTags('Customer-sales-item')
@FeatureFlag(API_MODULE_ENABLE_KEYS.CUSTOMER_SALES_ITEM)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.CUSTOMER_SALES_ITEM,
  version: V1,
})
export class CustomerSalesItemController {
  constructor(private readonly service: CustomerSalesItemService) {}

  /**
   * Create CustomerSalesItem
   * ------------------------
   */
  @Permissions('CUSTOMER_SALES_ITEM_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create customer-sales-item' })
  @ApiBody({ type: CreateCustomerSalesItemDto })
  @ApiSuccessResponse(
    { saleId: 'CUST-001' },
    CUSTOMER_SALES_ITEM.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateCustomerSalesItemDto) {
    return this.service.create(dto);
  }

  /**
   * Get CustomerSalesItems
   * ----------------------
   */
  @Get()
  @Permissions('CUSTOMER_SALES_ITEM_VIEW')
  async findAll(@Query() query: CustomerSalesItemQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get CustomerSalesItem by ID
   * ---------------------------
   */
  @Permissions('CUSTOMER_SALES_ITEM_VIEW')
  @Get(':saleId')
  @ApiParam({ name: 'saleId', description: 'CustomerSalesItem saleId' })
  async findOne(@Param('saleId') saleId: string) {
    return this.service.findBySaleId(saleId);
  }

  /**
   * Update CustomerSalesItem
   * -------------------------
   */
  @Permissions('CUSTOMER_SALES_ITEM_UPDATE')
  @Patch(':saleId')
  @ApiParam({ name: 'saleId', description: 'CustomerSalesItem saleId' })
  async update(
    @Param('saleId') saleId: string,
    @Body() dto: UpdateCustomerSalesItemDto,
  ) {
    return this.service.update(saleId, dto);
  }

  /**
   * Delete CustomerSalesItem
   * -------------------------
   */
  @Permissions('CUSTOMER_SALES_ITEM_DELETE')
  @Delete(':saleId')
  @ApiParam({ name: 'saleId', description: 'CustomerSalesItem saleId' })
  async delete(@Param('saleId') saleId: string) {
    return this.service.delete(saleId);
  }
}
