import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DeviceHeartbeatDto } from './dto/device-heartbeat.dto';
import { DeviceStatusService } from './device-status.service';
import { BackOfficeOnly } from 'src/core/decorators/back-office-only.decorator';

@ApiTags('Device Status')
@Controller({ path: 'device-status', version: '1' })
export class DeviceStatusController {
  constructor(private readonly service: DeviceStatusService) {}

  @Post('heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Battery %, last active time and offline periods from the app' })
  heartbeat(@Body() dto: DeviceHeartbeatDto) {
    return this.service.heartbeat(dto);
  }

  @BackOfficeOnly()
  @Get()
  @ApiOperation({ summary: 'Device status of users (comma separated userIds)' })
  findStatuses(@Query('userIds') userIds?: string) {
    return this.service.findStatuses(
      String(userIds ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
  }

  @BackOfficeOnly()
  @Get('offline-logs')
  @ApiOperation({ summary: 'Captured offline periods' })
  findOfflineLogs(
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findOfflineLogs({ userId, from, to });
  }
}
