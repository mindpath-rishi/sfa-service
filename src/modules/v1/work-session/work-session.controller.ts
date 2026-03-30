/**
 * WorkSession Controller
 * -----------------------
 * Purpose : Exposes APIs for managing work-sessions
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create work-sessions
 * - Fetch work-sessions with filters & pagination
 * - Retrieve individual work-session details
 * - Update work-session
 * - Soft delete work-sessions
 *
 * Notes:
 * - WorkSessions act as master reference data
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

import { WorkSessionService } from './work-session.service';
import { CreateWorkSessionDto } from './dto/create-work-session.dto';
import { UpdateWorkSessionDto } from './dto/update-work-session.dto';
import { WorkSessionQueryDto } from './dto/work-session-query.dto';
import { WORK_SESSION } from './work-session.constants';

@ApiTags('Work-session')
@FeatureFlag(API_MODULE_ENABLE_KEYS.WORK_SESSION)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.WORK_SESSION,
  version: V1,
})
export class WorkSessionController {
  constructor(private readonly service: WorkSessionService) {}

  /**
   * Create WorkSession
   * ------------------
   */
  @Permissions('WORK_SESSION_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create work-session' })
  @ApiBody({ type: CreateWorkSessionDto })
  @ApiSuccessResponse(
    { workSessionId: 'WORK-001' },
    WORK_SESSION.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateWorkSessionDto) {
    return this.service.create(dto);
  }

  /**
   * Get Today Active Work Session
   * ---------------------
   */
  @Permissions('WORK_SESSION_VIEW')
  @Get('today-active')
  async getTodayActiveWorkSession() {
    return this.service.getTodayActiveWorkSession();
  }

  /**
   * Get WorkSessions
   * ----------------
  @Get()
  @Permissions('WORK_SESSION_VIEW')
  async findAll(@Query() query: WorkSessionQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get WorkSession by ID
   * ---------------------
   */
  @Permissions('WORK_SESSION_VIEW')
  @Get(':workSessionId')
  @ApiParam({ name: 'workSessionId', description: 'WorkSession workSessionId' })
  async findOne(@Param('workSessionId') workSessionId: string) {
    return this.service.findByWorkSessionId(workSessionId);
  }

  /**
   * End WorkSession
   * -------------------
   */
  @Permissions('WORK_SESSION_END')
  @Patch()
  // @ApiParam({ name: 'workSessionId', description: 'WorkSession workSessionId' })
  async update() {
    // @Param('workSessionId') workSessionId: string,
    // @Body() dto: UpdateWorkSessionDto,
    return this.service.update();
  }

  /**
   * Delete WorkSession
   * -------------------
   */
  @Permissions('WORK_SESSION_DELETE')
  @Delete(':workSessionId')
  @ApiParam({ name: 'workSessionId', description: 'WorkSession workSessionId' })
  async delete(@Param('workSessionId') workSessionId: string) {
    return this.service.delete(workSessionId);
  }
}
