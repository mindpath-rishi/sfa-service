
/**
 * OutletType Controller
 * ----------------------
 * Purpose : Exposes APIs for managing outlet-types
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create outlet-types
 * - Fetch outlet-types with filters & pagination
 * - Retrieve individual outlet-type details
 * - Update outlet-types
 * - Soft delete outlet-types
 *
 * Notes:
 * - OutletTypes act as master reference data
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

import { OutletTypeService } from './outlet-type.service';
import { CreateOutletTypeDto } from './dto/create-outlet-type.dto';
import { UpdateOutletTypeDto } from './dto/update-outlet-type.dto';
import { OutletTypeQueryDto } from './dto/outlet-type-query.dto';
import { OUTLET_TYPE } from './outlet-type.constants';

@ApiTags('OutletType')
@FeatureFlag(API_MODULE_ENABLE_KEYS.OUTLET_TYPE)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.OUTLET_TYPE,
  version: V1,
})
export class OutletTypeController {
  constructor(private readonly service: OutletTypeService) {}

  /**
   * Create OutletType
   * -----------------
   */
  @Permissions('OUTLET_TYPE_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create outlet-type' })
  @ApiBody({ type: CreateOutletTypeDto })
  @ApiSuccessResponse(
    { outletTypeId: 'OUTL-001' },
    OUTLET_TYPE.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateOutletTypeDto) {
    return this.service.create(dto);
  }

  /**
   * Get OutletTypes
   * ---------------
   */
  @Get()
  @Permissions('OUTLET_TYPE_VIEW')
  async findAll(@Query() query: OutletTypeQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get OutletType by ID
   * --------------------
   */
  @Permissions('OUTLET_TYPE_VIEW')
  @Get(':outletTypeId')
  @ApiParam({ name: 'outletTypeId' })
  async findOne(@Param('outletTypeId') outletTypeId: string) {
    return this.service.findByOutletTypeId(outletTypeId);
  }

  /**
   * Update OutletType
   * ------------------
   */
  @Permissions('OUTLET_TYPE_UPDATE')
  @Patch(':outletTypeId')
  async update(
    @Param('outletTypeId') outletTypeId: string,
    @Body() dto: UpdateOutletTypeDto,
  ) {
    return this.service.update(outletTypeId, dto);
  }

  /**
   * Delete OutletType
   * ------------------
   */
  @Permissions('OUTLET_TYPE_DELETE')
  @Delete(':outletTypeId')
  async delete(@Param('outletTypeId') outletTypeId: string) {
    return this.service.delete(outletTypeId);
  }
}
