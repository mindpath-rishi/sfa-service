/**
 * CustomerSales Controller
 * -------------------------
 * Purpose : Exposes APIs for managing customer-saless
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create customer-saless
 * - Fetch customer-saless with filters & pagination
 * - Retrieve individual customer-sales details
 * - Update customer-sales
 * - Soft delete customer-saless
 *
 * Notes:
 * - CustomerSaless act as master reference data
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

import { CustomerSalesService } from './customer-sales.service';
import { CreateCustomerSalesDto } from './dto/create-customer-sales.dto';
import { UpdateCustomerSalesDto } from './dto/update-customer-sales.dto';
import { CustomerSalesQueryDto } from './dto/customer-sales-query.dto';
import { CUSTOMER_SALES } from './customer-sales.constants';

@ApiTags('Customer-sales')
@FeatureFlag(API_MODULE_ENABLE_KEYS.CUSTOMER_SALES)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.CUSTOMER_SALES,
  version: V1,
})
export class CustomerSalesController {
  constructor(private readonly service: CustomerSalesService) {}

  /**
   * Create CustomerSales
   * --------------------
   */
  @Permissions('CUSTOMER_SALES_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create customer-sales' })
  @ApiBody({ type: CreateCustomerSalesDto })
  @ApiSuccessResponse(
    { salesId: 'CUST-001' },
    CUSTOMER_SALES.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateCustomerSalesDto) {
    return this.service.create(dto);
  }

  /**
   * Get CustomerSaless
   * ------------------
   */
  @Get()
  @Permissions('CUSTOMER_SALES_VIEW')
  async findAll(@Query() query: CustomerSalesQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get CustomerSales by ID
   * -----------------------
   */
  @Permissions('CUSTOMER_SALES_VIEW')
  @Get(':salesId')
  @ApiParam({ name: 'salesId', description: 'CustomerSales salesId' })
  async findOne(@Param('salesId') salesId: string) {
    return this.service.findBySalesId(salesId);
  }

  /**
   * Update CustomerSales
   * ---------------------
   */
  @Permissions('CUSTOMER_SALES_UPDATE')
  @Patch(':salesId')
  @ApiParam({ name: 'salesId', description: 'CustomerSales salesId' })
  async update(
    @Param('salesId') salesId: string,
    @Body() dto: UpdateCustomerSalesDto,
  ) {
    return this.service.update(salesId, dto);
  }

  /**
   * Delete CustomerSales
   * ---------------------
   */
  @Permissions('CUSTOMER_SALES_DELETE')
  @Delete(':salesId')
  @ApiParam({ name: 'salesId', description: 'CustomerSales salesId' })
  async delete(@Param('salesId') salesId: string) {
    return this.service.delete(salesId);
  }
}
