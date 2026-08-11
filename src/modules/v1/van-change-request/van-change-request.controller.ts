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
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { FeatureFlag } from 'src/core/decorators/feature-flag.decorator';
import { Permissions } from 'src/core/decorators/permission.decorator';
import {
  API_MODULE,
  API_MODULE_ENABLE_KEYS,
  V1,
} from 'src/shared/constants/api.constants';
import { CreateVanChangeRequestDto } from './dto/create-van-change-request.dto';
import { UpdateVanChangeRequestDto } from './dto/update-van-change-request.dto';
import { VanChangeRequestQueryDto } from './dto/van-change-request-query.dto';
import { VanChangeRequestService } from './van-change-request.service';

@ApiTags('Van change request')
@FeatureFlag(API_MODULE_ENABLE_KEYS.WORK_SESSION)
@Controller({ path: API_MODULE.VAN_CHANGE_REQUEST, version: V1 })
export class VanChangeRequestController {
  constructor(private readonly service: VanChangeRequestService) {}

  @Permissions('WORK_SESSION_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a van change request' })
  create(@Body() dto: CreateVanChangeRequestDto) {
    return this.service.create(dto);
  }

  @Permissions('VAN_CHANGE')
  @Get()
  findAll(@Query() query: VanChangeRequestQueryDto) {
    return this.service.findAll(query);
  }

  @Permissions('VAN_CHANGE')
  @Get(':vanChangeRequestId')
  @ApiParam({ name: 'vanChangeRequestId' })
  findOne(@Param('vanChangeRequestId') id: string) {
    return this.service.findByRequestId(id);
  }

  @Permissions('WORK_SESSION_CREATE')
  @Patch(':vanChangeRequestId')
  update(
    @Param('vanChangeRequestId') id: string,
    @Body() dto: UpdateVanChangeRequestDto,
  ) {
    return this.service.update(id, dto);
  }

  @Permissions('VAN_CHANGE')
  @Patch(':vanChangeRequestId/approve')
  approve(@Param('vanChangeRequestId') id: string) {
    return this.service.approve(id);
  }

  @Permissions('VAN_CHANGE')
  @Patch(':vanChangeRequestId/reject')
  reject(@Param('vanChangeRequestId') id: string) {
    return this.service.reject(id);
  }

  @Permissions('WORK_SESSION_CREATE')
  @Patch(':vanChangeRequestId/cancel')
  cancel(@Param('vanChangeRequestId') id: string) {
    return this.service.cancel(id);
  }

  @Permissions('VAN_CHANGE')
  @Delete(':vanChangeRequestId')
  delete(@Param('vanChangeRequestId') id: string) {
    return this.service.delete(id);
  }
}
