
/**
 * Beat Controller
 * ----------------
 * Purpose : Exposes APIs for managing beats
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create beats
 * - Fetch beats with filters & pagination
 * - Retrieve individual beat details
 * - Update beats
 * - Soft delete beats
 *
 * Notes:
 * - Beats act as master reference data
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

import { BeatService } from './beat.service';
import { CreateBeatDto } from './dto/create-beat.dto';
import { UpdateBeatDto } from './dto/update-beat.dto';
import { BeatQueryDto } from './dto/beat-query.dto';
import { BEAT } from './beat.constants';

@ApiTags('Beat')
@FeatureFlag(API_MODULE_ENABLE_KEYS.BEAT)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.BEAT,
  version: V1,
})
export class BeatController {
  constructor(private readonly service: BeatService) {}

  /**
   * Create Beat
   * -----------
   */
  @Permissions('BEAT_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create beat' })
  @ApiBody({ type: CreateBeatDto })
  @ApiSuccessResponse(
    { beatId: 'BEAT-001' },
    BEAT.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateBeatDto) {
    return this.service.create(dto);
  }

  /**
   * Get Beats
   * ---------
   */
  @Get()
  @Permissions('BEAT_VIEW')
  async findAll(@Query() query: BeatQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get Beat by ID
   * --------------
   */
  @Permissions('BEAT_VIEW')
  @Get(':beatId')
  @ApiParam({ name: 'beatId' })
  async findOne(@Param('beatId') beatId: string) {
    return this.service.findByBeatId(beatId);
  }

  /**
   * Update Beat
   * ------------
   */
  @Permissions('BEAT_UPDATE')
  @Patch(':beatId')
  async update(
    @Param('beatId') beatId: string,
    @Body() dto: UpdateBeatDto,
  ) {
    return this.service.update(beatId, dto);
  }

  /**
   * Delete Beat
   * ------------
   */
  @Permissions('BEAT_DELETE')
  @Delete(':beatId')
  async delete(@Param('beatId') beatId: string) {
    return this.service.delete(beatId);
  }
}
