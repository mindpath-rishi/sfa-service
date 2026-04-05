/**
 * VanInventory Controller
 * ------------------------
 * Purpose : Exposes APIs for managing van-inventorys
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create van-inventorys
 * - Fetch van-inventorys with filters & pagination
 * - Retrieve individual van-inventory details
 * - Update van-inventory
 * - Soft delete van-inventorys
 *
 * Notes:
 * - VanInventorys act as master reference data
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

import { VanInventoryService } from './van-inventory.service';
import { CreateVanInventoryDto } from './dto/create-van-inventory.dto';
import { UpdateVanInventoryDto } from './dto/update-van-inventory.dto';
import { VanInventoryQueryDto } from './dto/van-inventory-query.dto';
import { VAN_INVENTORY } from './van-inventory.constants';
import { Public } from 'src/core/decorators/public.decorator';

@ApiTags('Van-inventory')
@FeatureFlag(API_MODULE_ENABLE_KEYS.VAN_INVENTORY)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.VAN_INVENTORY,
  version: V1,
})
@Public()
export class VanInventoryController {
  constructor(private readonly service: VanInventoryService) {}

  /**
   * Create VanInventory
   * -------------------
   */
  @Permissions('VAN_INVENTORY_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create van-inventory' })
  @ApiBody({ type: CreateVanInventoryDto })
  @ApiSuccessResponse(
    { inventoryId: 'VAN_-001' },
    VAN_INVENTORY.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateVanInventoryDto) {
    return this.service.create(dto);
  }

  /**
   * Get VanInventorys
   * -----------------
   */
  @Get()
  @Permissions('VAN_INVENTORY_VIEW')
  async findAll(@Query() query: VanInventoryQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get VanInventory by ID
   * ----------------------
   */
  @Permissions('VAN_INVENTORY_VIEW')
  @Get(':inventoryId')
  @ApiParam({ name: 'inventoryId', description: 'VanInventory inventoryId' })
  async findOne(@Param('inventoryId') inventoryId: string) {
    return this.service.findByInventoryId(inventoryId);
  }

  /**
   * Update VanInventory
   * --------------------
   */
  @Permissions('VAN_INVENTORY_UPDATE')
  @Patch(':inventoryId')
  @ApiParam({ name: 'inventoryId', description: 'VanInventory inventoryId' })
  async update(
    @Param('inventoryId') inventoryId: string,
    @Body() dto: UpdateVanInventoryDto,
  ) {
    return this.service.update(inventoryId, dto);
  }

  /**
   * Delete VanInventory
   * --------------------
   */
  @Permissions('VAN_INVENTORY_DELETE')
  @Delete(':inventoryId')
  @ApiParam({ name: 'inventoryId', description: 'VanInventory inventoryId' })
  async delete(@Param('inventoryId') inventoryId: string) {
    return this.service.delete(inventoryId);
  }
}
