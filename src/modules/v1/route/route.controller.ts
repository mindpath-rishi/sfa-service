/**
 * Route Controller
 * -----------------
 * Purpose : Exposes APIs for managing routes
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create routes
 * - Fetch routes with filters & pagination
 * - Retrieve individual route details
 * - Update route
 * - Soft delete routes
 *
 * Notes:
 * - Routes act as master reference data
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

import { RouteService } from './route.service';
import { CreateRouteDto, RouteCustomerDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { RouteCustomerQueryDto, RouteQueryDto } from './dto/route-query.dto';
import { ROUTE } from './route.constants';
import { Public } from 'src/core/decorators/public.decorator';

@ApiTags('Route')
@FeatureFlag(API_MODULE_ENABLE_KEYS.ROUTE)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.ROUTE,
  version: V1,
})
@Public()
export class RouteController {
  constructor(private readonly service: RouteService) {}

  /**
   * Create Route
   * ------------
   */
  @Permissions('ROUTE_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create route' })
  @ApiBody({ type: CreateRouteDto })
  @ApiSuccessResponse(
    { routeId: 'ROUT-001' },
    ROUTE.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateRouteDto) {
    return this.service.create(dto);
  }
  z;

  /**
   * Get Routes
   * ----------
   */
  @Get()
  @Permissions('ROUTE_VIEW')
  async findAll(@Query() query: RouteQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get Route by ID
   * ---------------
   */
  @Permissions('ROUTE_VIEW')
  @Get(':routeId')
  @ApiParam({ name: 'routeId', description: 'Route routeId' })
  async findOne(@Param('routeId') routeId: string) {
    return this.service.findByRouteId(routeId);
  }

  /**
   * Update Route
   * -------------
   */
  @Permissions('ROUTE_UPDATE')
  @Patch(':routeId')
  @ApiParam({ name: 'routeId', description: 'Route routeId' })
  async update(@Param('routeId') routeId: string, @Body() dto: UpdateRouteDto) {
    return this.service.update(routeId, dto);
  }

  /**
   * Delete Route
   * -------------
   */
  @Permissions('ROUTE_DELETE')
  @Delete(':routeId')
  @ApiParam({ name: 'routeId', description: 'Route routeId' })
  async delete(@Param('routeId') routeId: string) {
    return this.service.delete(routeId);
  }

  @Permissions('ROUTE_VIEW')
  @Get(':routeId/customers')
  @ApiOperation({ summary: 'Get customers for a route' })
  @ApiParam({ name: 'routeId', description: 'Route routeId' })
  async getRouteCustomers(
    @Param('routeId') routeId: string,
    @Query() query: RouteCustomerQueryDto,
  ) {
    console.log("==============139===========")
    return this.service.getRouteCustomers(routeId, query);
  }
}
  