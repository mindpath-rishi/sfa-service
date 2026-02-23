/**
 * VanInventoryTopupItem Controller
 * ---------------------------------
 * Purpose : Exposes APIs for managing van-inventory-topup-items
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create van-inventory-topup-items
 * - Fetch van-inventory-topup-items with filters & pagination
 * - Retrieve individual van-inventory-topup-item details
 * - Update van-inventory-topup-item
 * - Soft delete van-inventory-topup-items
 *
 * Notes:
 * - VanInventoryTopupItems act as master reference data
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

import { VanInventoryTopupItemService } from './van-inventory-topup-item.service';
import { CreateVanInventoryTopupItemDto } from './dto/create-van-inventory-topup-item.dto';
import { UpdateVanInventoryTopupItemDto } from './dto/update-van-inventory-topup-item.dto';
import { VanInventoryTopupItemQueryDto } from './dto/van-inventory-topup-item-query.dto';
import { VAN_INVENTORY_TOPUP_ITEM } from './van-inventory-topup-item.constants';

@ApiTags('Van-inventory-topup-item')
@FeatureFlag(API_MODULE_ENABLE_KEYS.VAN_INVENTORY_TOPUP_ITEM)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.VAN_INVENTORY_TOPUP_ITEM,
  version: V1,
})
export class VanInventoryTopupItemController {
  constructor(private readonly service: VanInventoryTopupItemService) {}

  /**
   * Create VanInventoryTopupItem
   * ----------------------------
   */
  @Permissions('VAN_INVENTORY_TOPUP_ITEM_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create van-inventory-topup-item' })
  @ApiBody({ type: CreateVanInventoryTopupItemDto })
  @ApiSuccessResponse(
    { vanInventoryTopupId: 'VAN_-001' },
    VAN_INVENTORY_TOPUP_ITEM.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateVanInventoryTopupItemDto) {
    return this.service.create(dto);
  }

  /**
   * Get VanInventoryTopupItems
   * --------------------------
   */
  @Get()
  @Permissions('VAN_INVENTORY_TOPUP_ITEM_VIEW')
  async findAll(@Query() query: VanInventoryTopupItemQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get VanInventoryTopupItem by ID
   * -------------------------------
   */
  @Permissions('VAN_INVENTORY_TOPUP_ITEM_VIEW')
  @Get(':vanInventoryTopupId')
  @ApiParam({ name: 'vanInventoryTopupId', description: 'VanInventoryTopupItem vanInventoryTopupId' })
  async findOne(@Param('vanInventoryTopupId') vanInventoryTopupId: string) {
    return this.service.findByVanInventoryTopupId(vanInventoryTopupId);
  }

  /**
   * Update VanInventoryTopupItem
   * -----------------------------
   */
  @Permissions('VAN_INVENTORY_TOPUP_ITEM_UPDATE')
  @Patch(':vanInventoryTopupId')
  @ApiParam({ name: 'vanInventoryTopupId', description: 'VanInventoryTopupItem vanInventoryTopupId' })
  async update(
    @Param('vanInventoryTopupId') vanInventoryTopupId: string,
    @Body() dto: UpdateVanInventoryTopupItemDto,
  ) {
    return this.service.update(vanInventoryTopupId, dto);
  }

  /**
   * Delete VanInventoryTopupItem
   * -----------------------------
   */
  @Permissions('VAN_INVENTORY_TOPUP_ITEM_DELETE')
  @Delete(':vanInventoryTopupId')
  @ApiParam({ name: 'vanInventoryTopupId', description: 'VanInventoryTopupItem vanInventoryTopupId' })
  async delete(@Param('vanInventoryTopupId') vanInventoryTopupId: string) {
    return this.service.delete(vanInventoryTopupId);
  }
}
