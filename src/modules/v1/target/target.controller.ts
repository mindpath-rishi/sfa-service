/**
 * Target Controller
 * ------------------
 * Purpose : Exposes APIs for managing targets
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create targets
 * - Fetch targets with filters & pagination
 * - Retrieve individual target details
 * - Update target
 * - Soft delete targets
 *
 * Notes:
 * - Targets act as master reference data
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

import { TargetService } from './target.service';
import { CreateTargetDto } from './dto/create-target.dto';
import { UpdateTargetDto } from './dto/update-target.dto';
import { TargetQueryDto } from './dto/target-query.dto';
import { TARGET } from './target.constants';

@ApiTags('Target')
@FeatureFlag(API_MODULE_ENABLE_KEYS.TARGET)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.TARGET,
  version: V1,
})
export class TargetController {
  constructor(private readonly service: TargetService) {}

  /**
   * Create Target
   * -------------
   */
  @Permissions('TARGET_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create target' })
  @ApiBody({ type: CreateTargetDto })
  @ApiSuccessResponse(
    { userId: 'TARG-001' },
    TARGET.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateTargetDto) {
    return this.service.create(dto);
  }

  /**
   * Get Targets
   * -----------
   */
  @Get()
  @Permissions('TARGET_VIEW')
  async findAll(@Query() query: TargetQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get Target by ID
   * ----------------
   */
  @Permissions('TARGET_VIEW')
  @Get(':userId')
  @ApiParam({ name: 'userId', description: 'Target userId' })
  async findOne(@Param('userId') userId: string) {
    return this.service.findByUserId(userId);
  }

  /**
   * Update Target
   * --------------
   */
  @Permissions('TARGET_UPDATE')
  @Patch(':userId')
  @ApiParam({ name: 'userId', description: 'Target userId' })
  async update(@Param('userId') userId: string, @Body() dto: UpdateTargetDto) {
    return this.service.update(userId, dto);
  }

  /**
   * Delete Target
   * --------------
   */
  @Permissions('TARGET_DELETE')
  @Delete(':userId')
  @ApiParam({ name: 'userId', description: 'Target userId' })
  async delete(@Param('userId') userId: string) {
    return this.service.delete(userId);
  }
}
