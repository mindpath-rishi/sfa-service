/**
 * VanInventoryTopup Controller
 * -----------------------------
 * Purpose : Exposes APIs for managing van-inventory-topups
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create van-inventory-topups
 * - Fetch van-inventory-topups with filters & pagination
 * - Retrieve individual van-inventory-topup details
 * - Update van-inventory-topup
 * - Soft delete van-inventory-topups
 *
 * Notes:
 * - VanInventoryTopups act as master reference data
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

import { VanInventoryTopupService } from './van-inventory-topup.service';
import { CreateVanInventoryTopupDto } from './dto/create-van-inventory-topup.dto';
import { UpdateVanInventoryTopupDto } from './dto/update-van-inventory-topup.dto';
import { VanInventoryTopupQueryDto } from './dto/van-inventory-topup-query.dto';
import { VAN_INVENTORY_TOPUP } from './van-inventory-topup.constants';
import { Public } from 'src/core/decorators/public.decorator';

@ApiTags('Van-inventory-topup')
@FeatureFlag(API_MODULE_ENABLE_KEYS.VAN_INVENTORY_TOPUP)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.VAN_INVENTORY_TOPUP,
  version: V1,
})
@Public()
export class VanInventoryTopupController {
  constructor(private readonly service: VanInventoryTopupService) {}

  /**
   * Create VanInventoryTopup
   * ------------------------
   */
  @Permissions('VAN_INVENTORY_TOPUP_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create van-inventory-topup' })
  @ApiBody({ type: CreateVanInventoryTopupDto })
  @ApiSuccessResponse(
    { vanInventoryTopupId: 'VAN_-001' },
    VAN_INVENTORY_TOPUP.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateVanInventoryTopupDto) {
    return this.service.create(dto);
  }

  /**
   * Get VanInventoryTopups
   * ----------------------
   */
  @Get()
  @Permissions('VAN_INVENTORY_TOPUP_VIEW')
  async findAll(@Query() query: VanInventoryTopupQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get VanInventoryTopup by ID
   * ---------------------------
   */
  @Permissions('VAN_INVENTORY_TOPUP_VIEW')
  @Get(':vanInventoryTopupId')
  @ApiParam({
    name: 'vanInventoryTopupId',
    description: 'VanInventoryTopup vanInventoryTopupId',
  })
  async findOne(@Param('vanInventoryTopupId') vanInventoryTopupId: string) {
    return this.service.findByVanInventoryTopupId(vanInventoryTopupId);
  }

  /**
   * Update VanInventoryTopup
   * -------------------------
   */
  @Permissions('VAN_INVENTORY_TOPUP_UPDATE')
  @Patch(':vanInventoryTopupId')
  @ApiParam({
    name: 'vanInventoryTopupId',
    description: 'VanInventoryTopup vanInventoryTopupId',
  })
  async update(
    @Param('vanInventoryTopupId') vanInventoryTopupId: string,
    @Body() dto: UpdateVanInventoryTopupDto,
  ) {
    return this.service.update(vanInventoryTopupId, dto);
  }

  /**
   * Delete VanInventoryTopup
   * -------------------------
   */
  @Permissions('VAN_INVENTORY_TOPUP_DELETE')
  @Delete(':vanInventoryTopupId')
  @ApiParam({
    name: 'vanInventoryTopupId',
    description: 'VanInventoryTopup vanInventoryTopupId',
  })
  async delete(@Param('vanInventoryTopupId') vanInventoryTopupId: string) {
    return this.service.delete(vanInventoryTopupId);
  }
}
