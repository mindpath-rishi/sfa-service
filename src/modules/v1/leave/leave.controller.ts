/**
 * Leave Controller
 * -----------------
 * Purpose : Exposes APIs for managing leaves
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create leaves
 * - Fetch leaves with filters & pagination
 * - Retrieve individual leave details
 * - Update leave
 * - Soft delete leaves
 *
 * Notes:
 * - Leaves act as master reference data
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

import { LeaveService } from './leave.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { UpdateLeaveDto } from './dto/update-leave.dto';
import { LeaveQueryDto } from './dto/leave-query.dto';
import { LEAVE } from './leave.constants';

@ApiTags('Leave')
@FeatureFlag(API_MODULE_ENABLE_KEYS.LEAVE)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.LEAVE,
  version: V1,
})
export class LeaveController {
  constructor(private readonly service: LeaveService) {}

  /**
   * Create Leave
   * ------------
   */
  @Permissions('LEAVE_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create leave' })
  @ApiBody({ type: CreateLeaveDto })
  @ApiSuccessResponse(
    { leaveId: 'LEAV-001' },
    LEAVE.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateLeaveDto) {
    return this.service.create(dto);
  }

  /**
   * Get Leaves
   * ----------
   */
  @Get()
  @Permissions('LEAVE_VIEW')
  async findAll(@Query() query: LeaveQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get Leave by ID
   * ---------------
   */
  @Permissions('LEAVE_VIEW')
  @Get(':leaveId')
  @ApiParam({ name: 'leaveId', description: 'Leave leaveId' })
  async findOne(@Param('leaveId') leaveId: string) {
    return this.service.findByLeaveId(leaveId);
  }

  /**
   * Update Leave
   * -------------
   */
  @Permissions('LEAVE_UPDATE')
  @Patch(':leaveId')
  @ApiParam({ name: 'leaveId', description: 'Leave leaveId' })
  async update(@Param('leaveId') leaveId: string, @Body() dto: UpdateLeaveDto) {
    return this.service.update(leaveId, dto);
  }

  /**
   * Delete Leave
   * -------------
   */
  @Permissions('LEAVE_DELETE')
  @Delete(':leaveId')
  @ApiParam({ name: 'leaveId', description: 'Leave leaveId' })
  async delete(@Param('leaveId') leaveId: string) {
    return this.service.delete(leaveId);
  }
}
