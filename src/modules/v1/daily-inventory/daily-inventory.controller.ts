/**
 * DailyInventory Controller
 * --------------------------
 * Purpose : Exposes APIs for managing daily-inventorys
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create daily-inventorys
 * - Fetch daily-inventorys with filters & pagination
 * - Retrieve individual daily-inventory details
 * - Update daily-inventory
 * - Soft delete daily-inventorys
 *
 * Notes:
 * - DailyInventorys act as master reference data
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

import { DailyInventoryService } from './daily-inventory.service';
import { CreateDailyInventoryDto } from './dto/create-daily-inventory.dto';
import { UpdateDailyInventoryDto } from './dto/update-daily-inventory.dto';
import { DailyInventoryQueryDto } from './dto/daily-inventory-query.dto';
import { DAILY_INVENTORY } from './daily-inventory.constants';

@ApiTags('DailyInventory')
@FeatureFlag(API_MODULE_ENABLE_KEYS.DAILY_INVENTORY)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.DAILY_INVENTORY,
  version: V1,
})
export class DailyInventoryController {
  constructor(private readonly service: DailyInventoryService) {}

  /**
   * Create DailyInventory
   * ---------------------
   */
  @Permissions('DAILY_INVENTORY_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create daily-inventory' })
  @ApiBody({ type: CreateDailyInventoryDto })
  @ApiSuccessResponse(
    { dailyInventoryId: 'DAIL-001' },
    DAILY_INVENTORY.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateDailyInventoryDto) {
    return this.service.create(dto);
  }

  /**
   * Get DailyInventorys
   * -------------------
   */
  @Get()
  @Permissions('DAILY_INVENTORY_VIEW')
  async findAll(@Query() query: DailyInventoryQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get DailyInventory by ID
   * ------------------------
   */
  @Permissions('DAILY_INVENTORY_VIEW')
  @Get(':dailyInventoryId')
  @ApiParam({
    name: 'dailyInventoryId',
    description: 'DailyInventory dailyInventoryId',
  })
  async findOne(@Param('dailyInventoryId') dailyInventoryId: string) {
    return this.service.findByDailyInventoryId(dailyInventoryId);
  }

  /**
   * Update DailyInventory
   * ----------------------
   */
  @Permissions('DAILY_INVENTORY_UPDATE')
  @Patch(':dailyInventoryId')
  @ApiParam({
    name: 'dailyInventoryId',
    description: 'DailyInventory dailyInventoryId',
  })
  async update(
    @Param('dailyInventoryId') dailyInventoryId: string,
    @Body() dto: UpdateDailyInventoryDto,
  ) {
    return this.service.update(dailyInventoryId, dto);
  }

  /**
   * Delete DailyInventory
   * ----------------------
   */
  @Permissions('DAILY_INVENTORY_DELETE')
  @Delete(':dailyInventoryId')
  @ApiParam({
    name: 'dailyInventoryId',
    description: 'DailyInventory dailyInventoryId',
  })
  async delete(@Param('dailyInventoryId') dailyInventoryId: string) {
    return this.service.delete(dailyInventoryId);
  }
}
