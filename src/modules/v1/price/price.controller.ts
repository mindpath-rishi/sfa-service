/**
 * Price Controller
 * -----------------
 * Purpose : Exposes APIs for managing prices
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create prices
 * - Fetch prices with filters & pagination
 * - Retrieve individual price details
 * - Update price
 * - Soft delete prices
 *
 * Notes:
 * - Prices act as master reference data
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

import { PriceService } from './price.service';
import { CreatePriceDto } from './dto/create-price.dto';
import { UpdatePriceDto } from './dto/update-price.dto';
import { PriceQueryDto } from './dto/price-query.dto';
import { PRICE } from './price.constants';
import { Public } from 'src/core/decorators/public.decorator';

@ApiTags('Price')
@FeatureFlag(API_MODULE_ENABLE_KEYS.PRICE)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.PRICE,
  version: V1,
})
export class PriceController {
  constructor(private readonly service: PriceService) {}

  /**
   * Create Price
   * ------------
   */
  @Permissions('PRICE_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create price' })
  @ApiBody({ type: CreatePriceDto })
  @ApiSuccessResponse(
    { priceId: 'PRIC-001' },
    PRICE.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreatePriceDto) {
    return this.service.create(dto);
  }

  @Public()
  @Permissions('PRICE_SYNC')
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync prices from ERP Oracle to MongoDB' })
  @ApiSuccessResponse(
    {
      totalERPRecords: 100,
      totalUniqueRecords: 100,
      totalValidRecords: 100,
      inserted: 10,
      updated: 90,
      matched: 90,
      synced: 100,
    },
    'ERP prices synced successfully.',
    HttpStatus.OK,
  )
  async syncPrices() {
    return this.service.syncPricesFromERP();
  }
  /**
   * Get Prices
   * ----------
   */
  @Get()
  @Permissions('PRICE_VIEW')
  async findAll(@Query() query: PriceQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get Price by ID
   * ---------------
   */
  @Permissions('PRICE_VIEW')
  @Get(':priceId')
  @ApiParam({ name: 'priceId', description: 'Price priceId' })
  async findOne(@Param('priceId') priceId: string) {
    return this.service.findByPriceId(priceId);
  }

  /**
   * Update Price
   * -------------
   */
  @Permissions('PRICE_UPDATE')
  @Patch(':priceId')
  @ApiParam({ name: 'priceId', description: 'Price priceId' })
  async update(@Param('priceId') priceId: string, @Body() dto: UpdatePriceDto) {
    return this.service.update(priceId, dto);
  }

  /**
   * Delete Price
   * -------------
   */
  @Permissions('PRICE_DELETE')
  @Delete(':priceId')
  @ApiParam({ name: 'priceId', description: 'Price priceId' })
  async delete(@Param('priceId') priceId: string) {
    return this.service.delete(priceId);
  }
}
