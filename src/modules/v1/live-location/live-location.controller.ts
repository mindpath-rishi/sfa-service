import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  UseGuards,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from 'src/core/decorators/permission.decorator';
import { CreateLiveLocationDto } from './dto/create-live-location.dto';
import { LiveLocationQueryDto } from './dto/live-location-query.dto';
import { LiveLocationService } from './live-location.service';
import { DayRouteService } from './day-route.service';
import { TrackingSettingsService } from './tracking-settings.service';
import {
  RestoreTrackingSettingsDto,
  UpdateTrackingSettingsDto,
} from './dto/tracking-settings.dto';
import { SuperAdminGuard } from 'src/core/guards/super-admin.guard';
import { TrackLiveLocationDto } from './dto/track-live-location.dto';

@ApiTags('Live Location Tracking')
@Controller({ path: 'live-location-tracking', version: '1' })
export class LiveLocationController {
  constructor(
    private readonly service: LiveLocationService,
    private readonly dayRoute: DayRouteService,
    private readonly trackingSettings: TrackingSettingsService,
  ) {}

  @Get('settings')
  @Permissions('LIVE_LOCATION_VIEW')
  @ApiOperation({ summary: 'Location tracking settings (global + per-user overrides)' })
  getSettings() {
    return this.trackingSettings.getSettings();
  }

  @Put('settings')
  @Permissions('LIVE_LOCATION_UPDATE')
  @ApiOperation({ summary: 'Update location tracking settings' })
  updateSettings(@Body() dto: UpdateTrackingSettingsDto) {
    return this.trackingSettings.updateSettings(dto as any);
  }

  @Get('settings/history')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Tracking settings versions (Super Admin)' })
  settingsHistory(@Query('limit') limit?: string) {
    return this.trackingSettings.getHistory(Number(limit) || 50);
  }

  @Post('settings/restore/:revision')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Restore a tracking settings version (Super Admin)' })
  restoreSettings(
    @Param('revision', ParseIntPipe) revision: number,
    @Body() dto: RestoreTrackingSettingsDto,
  ) {
    return this.trackingSettings.restore(revision, dto?.note);
  }

  @Get('settings/me')
  @Permissions('LIVE_LOCATION_CREATE')
  @ApiOperation({ summary: 'Effective tracking settings for the current user (app)' })
  mySettings() {
    return this.trackingSettings.getMySettings();
  }

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

  @Get('day-route')
  @Permissions('LIVE_LOCATION_VIEW')
  @ApiOperation({ summary: 'Day route of a user: road path, stops, visits, timeline, stats' })
  dayRouteOf(@Query('employeeId') employeeId: string, @Query('date') date?: string) {
    return this.dayRoute.getDayRoute(employeeId, date);
  }
}
