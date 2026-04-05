/**
 * Sales Controller
 * -----------------
 * Purpose : Exposes APIs for managing saless
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create saless
 * - Fetch saless with filters & pagination
 * - Retrieve individual sales details
 * - Update sales
 * - Soft delete saless
 *
 * Notes:
 * - Saless act as master reference data
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
import { SaleService } from './sale.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SALE } from './sale.constants';
import { SaleQueryDto } from './dto/sale.query.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';



@ApiTags('Sales')
@FeatureFlag(API_MODULE_ENABLE_KEYS.SALES)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.SALES,
  version: V1,
})
export class SalesController {
  constructor(private readonly service: SaleService) {}

  /**
   * Create Sales
   * ------------
   */
  @Permissions('SALES_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create sales' })
  @ApiBody({ type: CreateSaleDto })
  @ApiSuccessResponse(
    { salesId: 'SALE-001' },
    SALE.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateSaleDto) {
    return this.service.create(dto);
  }

  /**
   * Get Saless
   * ----------
   */
  @Get()
  @Permissions('SALES_VIEW')
  async findAll(@Query() query: SaleQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get Sales by ID
   * ---------------
   */
  @Permissions('SALES_VIEW')
  @Get(':salesId')
  @ApiParam({ name: 'salesId', description: 'Sales salesId' })
  async findOne(@Param('salesId') salesId: string) {
    return this.service.findBySalesId(salesId);
  }

  /**
   * Update Sales
   * -------------
   */
  @Permissions('SALES_UPDATE')
  @Patch(':salesId')
  @ApiParam({ name: 'salesId', description: 'Sales salesId' })
  async update(
    @Param('salesId') salesId: string,
    @Body() dto: UpdateSaleDto,
  ) {
    return this.service.update(salesId, dto);
  }

  /**
   * Delete Sales
   * -------------
   */
  @Permissions('SALES_DELETE')
  @Delete(':salesId')
  @ApiParam({ name: 'salesId', description: 'Sales salesId' })
  async delete(@Param('salesId') salesId: string) {
    return this.service.delete(salesId);
  }
}
