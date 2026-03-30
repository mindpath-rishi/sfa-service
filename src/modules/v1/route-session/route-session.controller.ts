/**
 * RouteSession Controller
 * ------------------------
 * Purpose : Exposes APIs for managing route-sessions
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create route-sessions
 * - Fetch route-sessions with filters & pagination
 * - Retrieve individual route-session details
 * - Update route-session
 * - Soft delete route-sessions
 *
 * Notes:
 * - RouteSessions act as master reference data
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

import { RouteSessionService } from './route-session.service';
import { CreateRouteSessionDto } from './dto/create-route-session.dto';
import { UpdateRouteSessionDto } from './dto/update-route-session.dto';
import { RouteSessionQueryDto } from './dto/route-session-query.dto';
import { ROUTE_SESSION } from './route-session.constants';

@ApiTags('Route-session')
@FeatureFlag(API_MODULE_ENABLE_KEYS.ROUTE_SESSION)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.ROUTE_SESSION,
  version: V1,
})
export class RouteSessionController {
  constructor(private readonly service: RouteSessionService) {}

  /**
   * Create RouteSession
   * -------------------
   */
  @Permissions('ROUTE_SESSION_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create route-session' })
  @ApiBody({ type: CreateRouteSessionDto })
  @ApiSuccessResponse(
    { routeSessionId: 'ROUT-001' },
    ROUTE_SESSION.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateRouteSessionDto) {
    return this.service.create(dto);
  }

  /**
   * Get RouteSessions
   * -----------------
   */
  @Get()
  @Permissions('ROUTE_SESSION_VIEW')
  async findAll(@Query() query: RouteSessionQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get RouteSession by ID
   * ----------------------
   */
  @Permissions('ROUTE_SESSION_VIEW')
  @Get(':routeSessionId')
  @ApiParam({ name: 'routeSessionId', description: 'RouteSession routeSessionId' })
  async findOne(@Param('routeSessionId') routeSessionId: string) {
    return this.service.findByRouteSessionId(routeSessionId);
  }

  /**
   * Update RouteSession
   * --------------------
   */
  @Permissions('ROUTE_SESSION_UPDATE')
  @Patch(':routeSessionId')
  @ApiParam({ name: 'routeSessionId', description: 'RouteSession routeSessionId' })
  async update(
    @Param('routeSessionId') routeSessionId: string,
    @Body() dto: UpdateRouteSessionDto,
  ) {
    return this.service.update(routeSessionId, dto);
  }

  /**
   * Delete RouteSession
   * --------------------
   */
  @Permissions('ROUTE_SESSION_DELETE')
  @Delete(':routeSessionId')
  @ApiParam({ name: 'routeSessionId', description: 'RouteSession routeSessionId' })
  async delete(@Param('routeSessionId') routeSessionId: string) {
    return this.service.delete(routeSessionId);
  }
}
