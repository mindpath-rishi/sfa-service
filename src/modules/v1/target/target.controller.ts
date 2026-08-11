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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
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
import { BulkUploadTargetsDto } from './dto/bulk-upload-targets.dto';
import { CreateFocusedPackTargetDto } from './dto/create-focused-pack-target.dto';
import { UpdateFocusedPackTargetDto } from './dto/update-focused-pack-target.dto';
import { FocusedPackTargetQueryDto } from './dto/focused-pack-target-query.dto';
import { BulkUploadFocusedPackTargetsDto } from './dto/bulk-upload-focused-pack-targets.dto';

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

  @Permissions('TARGET_CREATE')
  @Post('bulk-upload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk upload targets' })
  @ApiBody({ type: BulkUploadTargetsDto })
  async bulkUpload(@Body() dto: BulkUploadTargetsDto) {
    return this.service.bulkUpload(dto);
  }

  @Permissions('TARGET_CREATE')
  @Post('focused-pack')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create or update a product-wise Focused Pack target',
  })
  async upsertFocusedPackTarget(@Body() dto: CreateFocusedPackTargetDto) {
    return this.service.upsertFocusedPackTarget(dto);
  }

  @Permissions('TARGET_CREATE')
  @Post('focused-pack/bulk-upload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk create or update product-wise Focused Pack targets',
  })
  async bulkUploadFocusedPackTargets(
    @Body() dto: BulkUploadFocusedPackTargetsDto,
  ) {
    return this.service.bulkUploadFocusedPackTargets(dto);
  }

  @Permissions('TARGET_VIEW')
  @Get('focused-pack')
  @ApiOperation({ summary: 'List Focused Pack targets' })
  async findAllFocusedPackTargets(@Query() query: FocusedPackTargetQueryDto) {
    return this.service.findAllFocusedPackTargets(query);
  }

  @Permissions('TARGET_VIEW')
  @Get('focused-pack/:id')
  @ApiParam({ name: 'id', description: 'Focused Pack target document ID' })
  async findFocusedPackTargetById(@Param('id') id: string) {
    return this.service.findFocusedPackTargetById(id);
  }

  @Permissions('TARGET_UPDATE')
  @Patch('focused-pack/:id')
  @ApiParam({ name: 'id', description: 'Focused Pack target document ID' })
  async updateFocusedPackTarget(
    @Param('id') id: string,
    @Body() dto: UpdateFocusedPackTargetDto,
  ) {
    return this.service.updateFocusedPackTarget(id, dto);
  }

  @Permissions('TARGET_DELETE')
  @Delete('focused-pack/:id')
  @ApiParam({ name: 'id', description: 'Focused Pack target document ID' })
  async deleteFocusedPackTarget(@Param('id') id: string) {
    return this.service.deleteFocusedPackTarget(id);
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

  @Get('export')
  @Permissions('TARGET_VIEW')
  @ApiOperation({ summary: 'Export targets as Excel or PDF' })
  async exportTargets(@Query() query: TargetQueryDto, @Res() res: Response) {
    const file = await this.service.exportTargets(query);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    res.send(file.buffer);
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
