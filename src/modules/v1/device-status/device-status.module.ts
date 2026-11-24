import { Module } from '@nestjs/common';
import { DeviceStatusController } from './device-status.controller';
import { DeviceStatusService } from './device-status.service';
import { LiveLocationModule } from '../live-location/live-location.module';

@Module({
  imports: [LiveLocationModule],
  controllers: [DeviceStatusController],
  providers: [DeviceStatusService],
  exports: [DeviceStatusService],
})
export class DeviceStatusModule {}
