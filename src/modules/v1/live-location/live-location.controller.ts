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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from 'src/core/decorators/permission.decorator';
import { CreateLiveLocationDto } from './dto/create-live-location.dto';
import { LiveLocationQueryDto } from './dto/live-location-query.dto';
import { UpdateLiveLocationDto } from './dto/update-live-location.dto';
import { LiveLocationService } from './live-location.service';
import { TrackLiveLocationDto } from './dto/track-live-location.dto';

@ApiTags('Live Location Tracking')
@Controller({ path: 'live-location-tracking', version: '1' })
export class LiveLocationController {
  constructor(private readonly service: LiveLocationService) {}

  @Post('track')
  @Permissions('LIVE_LOCATION_CREATE')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Track location for the authenticated active user' })
  track(@Body() dto: TrackLiveLocationDto) {
    return this.service.track(dto);
  }

  @Post()
  @Permissions('LIVE_LOCATION_CREATE')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a live location point' })
  create(@Body() dto: CreateLiveLocationDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions('LIVE_LOCATION_VIEW')
  findAll(@Query() query: LiveLocationQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':locationId')
  @Permissions('LIVE_LOCATION_VIEW')
  findOne(@Param('locationId') locationId: string) {
    return this.service.findByLocationId(locationId);
  }

  @Patch(':locationId')
  @Permissions('LIVE_LOCATION_UPDATE')
  update(
    @Param('locationId') locationId: string,
    @Body() dto: UpdateLiveLocationDto,
  ) {
    return this.service.updateLocation(locationId, dto);
  }

  @Delete(':locationId')
  @Permissions('LIVE_LOCATION_DELETE')
  delete(@Param('locationId') locationId: string) {
    return this.service.deleteLocation(locationId);
  }
}
