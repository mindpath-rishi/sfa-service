
/**
 * Channel Controller
 * -------------------
 * Purpose : Exposes APIs for managing channels
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create channels
 * - Fetch channels with filters & pagination
 * - Retrieve individual channel details
 * - Update channels
 * - Soft delete channels
 *
 * Notes:
 * - Channels act as master reference data
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

import { ChannelService } from './channel.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { ChannelQueryDto } from './dto/channel-query.dto';
import { CHANNEL } from './channel.constants';

@ApiTags('Channel')
@FeatureFlag(API_MODULE_ENABLE_KEYS.CHANNEL)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.CHANNEL,
  version: V1,
})
export class ChannelController {
  constructor(private readonly service: ChannelService) {}

  /**
   * Create Channel
   * --------------
   */
  @Permissions('CHANNEL_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create channel' })
  @ApiBody({ type: CreateChannelDto })
  @ApiSuccessResponse(
    { channelId: 'CHAN-001' },
    CHANNEL.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateChannelDto) {
    return this.service.create(dto);
  }

  /**
   * Get Channels
   * ------------
   */
  @Get()
  @Permissions('CHANNEL_VIEW')
  async findAll(@Query() query: ChannelQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get Channel by ID
   * -----------------
   */
  @Permissions('CHANNEL_VIEW')
  @Get(':channelId')
  @ApiParam({ name: 'channelId' })
  async findOne(@Param('channelId') channelId: string) {
    return this.service.findByChannelId(channelId);
  }

  /**
   * Update Channel
   * ---------------
   */
  @Permissions('CHANNEL_UPDATE')
  @Patch(':channelId')
  async update(
    @Param('channelId') channelId: string,
    @Body() dto: UpdateChannelDto,
  ) {
    return this.service.update(channelId, dto);
  }

  /**
   * Delete Channel
   * ---------------
   */
  @Permissions('CHANNEL_DELETE')
  @Delete(':channelId')
  async delete(@Param('channelId') channelId: string) {
    return this.service.delete(channelId);
  }
}
