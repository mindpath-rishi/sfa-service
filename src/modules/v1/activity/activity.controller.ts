/**
 * Activity Controller
 * --------------------
 * Purpose : Exposes APIs for managing activitys
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create activitys
 * - Fetch activitys with filters & pagination
 * - Retrieve individual activity details
 * - Update activity
 * - Soft delete activitys
 *
 * Notes:
 * - Activitys act as master reference data
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

import { ActivityService } from './activity.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ActivityQueryDto } from './dto/activity-query.dto';
import { ACTIVITY } from './activity.constants';

@ApiTags('Activity')
@FeatureFlag(API_MODULE_ENABLE_KEYS.ACTIVITY)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.ACTIVITY,
  version: V1,
})
export class ActivityController {
  constructor(private readonly service: ActivityService) {}

  /**
   * Create Activity
   * ---------------
   */
  @Permissions('ACTIVITY_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create activity' })
  @ApiBody({ type: CreateActivityDto })
  @ApiSuccessResponse(
    { activityId: 'ACTI-001' },
    ACTIVITY.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateActivityDto) {
    return this.service.create(dto);
  }

  /**
   * Get Activitys
   * -------------
   */
  @Get()
  @Permissions('ACTIVITY_VIEW')
  async findAll(@Query() query: ActivityQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get Activity by ID
   * ------------------
   */
  @Permissions('ACTIVITY_VIEW')
  @Get(':activityId')
  @ApiParam({ name: 'activityId', description: 'Activity activityId' })
  async findOne(@Param('activityId') activityId: string) {
    return this.service.findByActivityId(activityId);
  }

  /**
   * Update Activity
   * ----------------
   */
  @Permissions('ACTIVITY_UPDATE')
  @Patch(':activityId')
  @ApiParam({ name: 'activityId', description: 'Activity activityId' })
  async update(
    @Param('activityId') activityId: string,
    @Body() dto: UpdateActivityDto,
  ) {
    return this.service.update(activityId, dto);
  }

  /**
   * Delete Activity
   * ----------------
   */
  @Permissions('ACTIVITY_DELETE')
  @Delete(':activityId')
  @ApiParam({ name: 'activityId', description: 'Activity activityId' })
  async delete(@Param('activityId') activityId: string) {
    return this.service.delete(activityId);
  }
}
