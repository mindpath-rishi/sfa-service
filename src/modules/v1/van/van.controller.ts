/**
 * Van Controller
 * --------------
 * Purpose : Exposes APIs for managing van master lifecycle
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create vans
 * - Fetch vans with filters & pagination
 * - Retrieve individual van details
 * - Update vans
 * - Soft delete vans
 *
 * Notes:
 * - Vans are assigned to drivers/employees
 * - Inventory and route mapping is handled separately
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

import { VanService } from './van.service';
import { CreateVanDto } from './dto/create-van.dto';
import { UpdateVanDto } from './dto/update-van.dto';
import { VanQueryDto } from './dto/van-query.dto';
import { VAN } from './van.constants';
import { Public } from 'src/core/decorators/public.decorator';

@ApiTags('Van')
@FeatureFlag(API_MODULE_ENABLE_KEYS.VAN)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.VAN,
  version: V1,
})
// @Public()
export class VanController {
  constructor(private readonly vanService: VanService) {}

  /**
   * Create Van
   * ----------
   * Purpose : Create new van master record
   * Used by : ADMIN FLOWS
   */
  @Permissions('VAN_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create van' })
  @ApiBody({ type: CreateVanDto })
  @ApiSuccessResponse(
    {
      vanId: 'VID-001',
      name: 'Delivery Van 1',
    },
    VAN.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateVanDto) {
    return this.vanService.create(dto);
  }

  /**
   * Get Van mapped routes
   * -------------
   * Purpose : Retrieve single van details
   * Used by : VAN DETAIL VIEW
   */
  @Get('mapped-routes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get van mapped routes' })
  // @ApiParam({ name: 'vanId' })
  @ApiSuccessResponse(
    {
      vanId: 'VID-001',
      name: 'Delivery Van 1',
    },
    VAN.FETCHED,
  )
  @ApiNotFoundResponse()
  async getVanMappedRoutes() {
    return this.vanService.getVanMappedRoutes();
  }

  /**
   * Get Vans
   * --------
   * Purpose : Retrieve paginated van list
   * Used by : VAN LISTING / ADMIN SCREENS
   *
   * Supports:
   * - Name / number search
   * - Status filtering
   * - Pagination
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get vans' })
  @ApiSuccessResponse(
    {
      items: [
        {
          vanId: 'VID-001',
          name: 'Delivery Van 1',
          status: 'ACTIVE',
        },
      ],
      meta: {
        total: 5,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    },
    VAN.FETCHED,
  )
  async findAll(@Query() query: VanQueryDto) {
    return this.vanService.findAll(query);
  }

  /**
   * Get Van by ID
   * -------------
   * Purpose : Retrieve single van details
   * Used by : VAN DETAIL VIEW
   */
  @Get(':vanId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get van by id' })
  @ApiParam({ name: 'vanId' })
  @ApiSuccessResponse(
    {
      vanId: 'VID-001',
      name: 'Delivery Van 1',
    },
    VAN.FETCHED,
  )
  @ApiNotFoundResponse()
  async findOne(@Param('vanId') vanId: string) {
    return this.vanService.findByVanId(vanId);
  }

  /**
   * Update Van
   * ----------
   * Purpose : Update van master data
   * Used by : ADMIN FLOWS
   */
  @Permissions('VAN_UPDATE')
  @Patch(':vanId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update van' })
  @ApiParam({ name: 'vanId' })
  @ApiBody({ type: UpdateVanDto })
  @ApiSuccessResponse(null, VAN.UPDATED)
  @ApiNotFoundResponse()
  async update(@Param('vanId') vanId: string, @Body() dto: UpdateVanDto) {
    return this.vanService.update(vanId, dto);
  }

  /**
   * Delete Van
   * ----------
   * Purpose : Soft delete van
   * Used by : ADMIN FLOWS
   */
  @Permissions('VAN_DELETE')
  @Delete(':vanId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete van' })
  @ApiParam({ name: 'vanId' })
  @ApiSuccessResponse(null, VAN.DELETED)
  @ApiNotFoundResponse()
  async delete(@Param('vanId') vanId: string) {
    return this.vanService.delete(vanId);
  }
}
