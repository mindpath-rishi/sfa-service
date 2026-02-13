
/**
 * Market Controller
 * ------------------
 * Purpose : Exposes APIs for managing markets
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create markets
 * - Fetch markets with filters & pagination
 * - Retrieve individual market details
 * - Update markets
 * - Soft delete markets
 *
 * Notes:
 * - Markets act as master reference data
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

import { MarketService } from './market.service';
import { CreateMarketDto } from './dto/create-market.dto';
import { UpdateMarketDto } from './dto/update-market.dto';
import { MarketQueryDto } from './dto/market-query.dto';
import { MARKET } from './market.constants';

@ApiTags('Market')
@FeatureFlag(API_MODULE_ENABLE_KEYS.MARKET)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.MARKET,
  version: V1,
})
export class MarketController {
  constructor(private readonly service: MarketService) {}

  /**
   * Create Market
   * -------------
   */
  @Permissions('MARKET_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create market' })
  @ApiBody({ type: CreateMarketDto })
  @ApiSuccessResponse(
    { marketId: 'MARK-001' },
    MARKET.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateMarketDto) {
    return this.service.create(dto);
  }

  /**
   * Get Markets
   * -----------
   */
  @Get()
  @Permissions('MARKET_VIEW')
  async findAll(@Query() query: MarketQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get Market by ID
   * ----------------
   */
  @Permissions('MARKET_VIEW')
  @Get(':marketId')
  @ApiParam({ name: 'marketId' })
  async findOne(@Param('marketId') marketId: string) {
    return this.service.findByMarketId(marketId);
  }

  /**
   * Update Market
   * --------------
   */
  @Permissions('MARKET_UPDATE')
  @Patch(':marketId')
  async update(
    @Param('marketId') marketId: string,
    @Body() dto: UpdateMarketDto,
  ) {
    return this.service.update(marketId, dto);
  }

  /**
   * Delete Market
   * --------------
   */
  @Permissions('MARKET_DELETE')
  @Delete(':marketId')
  async delete(@Param('marketId') marketId: string) {
    return this.service.delete(marketId);
  }
}
