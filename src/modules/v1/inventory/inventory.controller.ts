
/**
 * Inventory Controller
 * ---------------------
 * Purpose : Exposes APIs for managing inventorys
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create inventorys
 * - Fetch inventorys with filters & pagination
 * - Retrieve individual inventory details
 * - Update inventorys
 * - Soft delete inventorys
 *
 * Notes:
 * - Inventorys act as master reference data
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

import { Permissions } from 'src/core/decorators/permissioin.decorator';

import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { INVENTORY } from './inventory.constants';

@ApiTags('Inventory')
@FeatureFlag(API_MODULE_ENABLE_KEYS.INVENTORY)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.INVENTORY,
  version: V1,
})
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  /**
   * Create Inventory
   * ----------------
   */
  @Permissions('INVENTORY_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create inventory' })
  @ApiBody({ type: CreateInventoryDto })
  @ApiSuccessResponse(
    { inventoryId: 'INVE-001' },
    INVENTORY.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateInventoryDto) {
    return this.service.create(dto);
  }

  /**
   * Get Inventorys
   * --------------
   */
  @Get()
  @Permissions('INVENTORY_VIEW')
  async findAll(@Query() query: InventoryQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get Inventory by ID
   * -------------------
   */
  @Permissions('INVENTORY_VIEW')
  @Get(':inventoryId')
  @ApiParam({ name: 'inventoryId' })
  async findOne(@Param('inventoryId') inventoryId: string) {
    return this.service.findByInventoryId(inventoryId);
  }

  /**
   * Update Inventory
   * -----------------
   */
  @Permissions('INVENTORY_UPDATE')
  @Patch(':inventoryId')
  async update(
    @Param('inventoryId') inventoryId: string,
    @Body() dto: UpdateInventoryDto,
  ) {
    return this.service.update(inventoryId, dto);
  }

  /**
   * Delete Inventory
   * -----------------
   */
  @Permissions('INVENTORY_DELETE')
  @Delete(':inventoryId')
  async delete(@Param('inventoryId') inventoryId: string) {
    return this.service.delete(inventoryId);
  }
}
