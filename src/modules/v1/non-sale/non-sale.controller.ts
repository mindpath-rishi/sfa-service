/**
 * NonSale Controller
 * -------------------
 * Purpose : Exposes APIs for managing non-sales
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create non-sales
 * - Fetch non-sales with filters & pagination
 * - Retrieve individual non-sale details
 * - Update non-sale
 * - Soft delete non-sales
 *
 * Notes:
 * - NonSales act as master reference data
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

import { NonSaleService } from './non-sale.service';
import { CreateNonSaleDto } from './dto/create-non-sale.dto';
import { UpdateNonSaleDto } from './dto/update-non-sale.dto';
import { NonSaleQueryDto } from './dto/non-sale-query.dto';
import { NON_SALE } from './non-sale.constants';

@ApiTags('Non-sale')
@FeatureFlag(API_MODULE_ENABLE_KEYS.NON_SALE)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.NON_SALE,
  version: V1,
})
export class NonSaleController {
  constructor(private readonly service: NonSaleService) {}

  /**
   * Create NonSale
   * --------------
   */
  @Permissions('NON_SALE_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create non-sale' })
  @ApiBody({ type: CreateNonSaleDto })
  @ApiSuccessResponse(
    { nonSaleId: 'NON_-001' },
    NON_SALE.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateNonSaleDto) {
    return this.service.create(dto);
  }

  /**
   * Get NonSales
   * ------------
   */
  @Get()
  @Permissions('NON_SALE_VIEW')
  async findAll(@Query() query: NonSaleQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get NonSale by ID
   * -----------------
   */
  @Permissions('NON_SALE_VIEW')
  @Get(':nonSaleId')
  @ApiParam({ name: 'nonSaleId', description: 'NonSale nonSaleId' })
  async findOne(@Param('nonSaleId') nonSaleId: string) {
    return this.service.findByNonSaleId(nonSaleId);
  }

  /**
   * Update NonSale
   * ---------------
   */
  @Permissions('NON_SALE_UPDATE')
  @Patch(':nonSaleId')
  @ApiParam({ name: 'nonSaleId', description: 'NonSale nonSaleId' })
  async update(
    @Param('nonSaleId') nonSaleId: string,
    @Body() dto: UpdateNonSaleDto,
  ) {
    return this.service.update(nonSaleId, dto);
  }

  /**
   * Delete NonSale
   * ---------------
   */
  @Permissions('NON_SALE_DELETE')
  @Delete(':nonSaleId')
  @ApiParam({ name: 'nonSaleId', description: 'NonSale nonSaleId' })
  async delete(@Param('nonSaleId') nonSaleId: string) {
    return this.service.delete(nonSaleId);
  }
}
