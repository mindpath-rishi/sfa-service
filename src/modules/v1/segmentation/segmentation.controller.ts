import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { FeatureFlag } from 'src/core/decorators/feature-flag.decorator';
import { Permissions } from 'src/core/decorators/permission.decorator';
import { API_MODULE, API_MODULE_ENABLE_KEYS, V1 } from 'src/shared/constants/api.constants';
import { CreateSegmentationDto } from './dto/create-segmentation.dto';
import { UpdateSegmentationDto } from './dto/update-segmentation.dto';
import { SegmentationQueryDto } from './dto/segmentation-query.dto';
import { SegmentationService } from './segmentation.service';

@ApiTags('Segmentation')
@FeatureFlag(API_MODULE_ENABLE_KEYS.SEGMENTATION)
@Controller({ path: API_MODULE.SEGMENTATION, version: V1 })
export class SegmentationController {
  constructor(private readonly service: SegmentationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('SEGMENTATION_CREATE')
  @ApiOperation({ summary: 'Create segmentation' })
  @ApiBody({ type: CreateSegmentationDto })
  create(@Body() dto: CreateSegmentationDto) { return this.service.create(dto); }

  @Get()
  @Permissions('SEGMENTATION_VIEW')
  findAll(@Query() query: SegmentationQueryDto) { return this.service.findAll(query); }

  @Get(':segmentationId')
  @Permissions('SEGMENTATION_VIEW')
  @ApiParam({ name: 'segmentationId' })
  findOne(@Param('segmentationId') id: string) { return this.service.findBySegmentationId(id); }

  @Patch(':segmentationId')
  @Permissions('SEGMENTATION_UPDATE')
  update(@Param('segmentationId') id: string, @Body() dto: UpdateSegmentationDto) { return this.service.update(id, dto); }

  @Delete(':segmentationId')
  @Permissions('SEGMENTATION_DELETE')
  delete(@Param('segmentationId') id: string) { return this.service.delete(id); }
}
