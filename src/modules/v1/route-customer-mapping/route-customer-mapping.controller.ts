/**
 * RouteCustomerMapping Controller
 * --------------------------------
 * Purpose : Exposes APIs for managing route-customer-mappings
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create route-customer-mappings
 * - Fetch route-customer-mappings with filters & pagination
 * - Retrieve individual route-customer-mapping details
 * - Update route-customer-mapping
 * - Soft delete route-customer-mappings
 *
 * Notes:
 * - RouteCustomerMappings act as master reference data
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

import { RouteCustomerMappingService } from './route-customer-mapping.service';
import { CreateRouteCustomerMappingDto } from './dto/create-route-customer-mapping.dto';
import { UpdateRouteCustomerMappingDto } from './dto/update-route-customer-mapping.dto';
import { RouteCustomerMappingQueryDto } from './dto/route-customer-mapping-query.dto';
import { ROUTE_CUSTOMER_MAPPING } from './route-customer-mapping.constants';
import { Public } from 'src/core/decorators/public.decorator';

@ApiTags('Route-customer-mapping')
@FeatureFlag(API_MODULE_ENABLE_KEYS.ROUTE_CUSTOMER_MAPPING)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.ROUTE_CUSTOMER_MAPPING,
  version: V1,
})
@Public()
export class RouteCustomerMappingController {
  constructor(private readonly service: RouteCustomerMappingService) {}

  /**
   * Create RouteCustomerMapping
   * ---------------------------
   */
  @Permissions('ROUTE_CUSTOMER_MAPPING_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create route-customer-mapping' })
  @ApiBody({ type: CreateRouteCustomerMappingDto })
  @ApiSuccessResponse(
    { mappingId: 'ROUT-001' },
    ROUTE_CUSTOMER_MAPPING.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateRouteCustomerMappingDto) {
    return this.service.create(dto);
  }

  /**
   * Get RouteCustomerMappings
   * -------------------------
   */
  @Get()
  @Permissions('ROUTE_CUSTOMER_MAPPING_VIEW')
  async findAll(@Query() query: RouteCustomerMappingQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get RouteCustomerMapping by ID
   * ------------------------------
   */
  @Permissions('ROUTE_CUSTOMER_MAPPING_VIEW')
  @Get(':mappingId')
  @ApiParam({ name: 'mappingId', description: 'RouteCustomerMapping mappingId' })
  async findOne(@Param('mappingId') mappingId: string) {
    return this.service.findByMappingId(mappingId);
  }

  /**
   * Update RouteCustomerMapping
   * ----------------------------
   */
  @Permissions('ROUTE_CUSTOMER_MAPPING_UPDATE')
  @Patch(':mappingId')
  @ApiParam({ name: 'mappingId', description: 'RouteCustomerMapping mappingId' })
  async update(
    @Param('mappingId') mappingId: string,
    @Body() dto: UpdateRouteCustomerMappingDto,
  ) {
    return this.service.update(mappingId, dto);
  }

  /**
   * Delete RouteCustomerMapping
   * ----------------------------
   */
  @Permissions('ROUTE_CUSTOMER_MAPPING_DELETE')
  @Delete(':mappingId')
  @ApiParam({ name: 'mappingId', description: 'RouteCustomerMapping mappingId' })
  async delete(@Param('mappingId') mappingId: string) {
    return this.service.delete(mappingId);
  }
}
