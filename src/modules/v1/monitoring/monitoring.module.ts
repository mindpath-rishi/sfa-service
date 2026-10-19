import { Module } from '@nestjs/common';
import { FeatureDebugModule } from '../feature-debug/feature-debug.module';
import { NotificationModule } from '../notification/notification.module';
import { AlertsService } from './alerts.service';
import { HealthService } from './health.service';
import { MonitoringController } from './monitoring.controller';
import { MonitoringScheduler } from './monitoring.scheduler';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [FeatureDebugModule, NotificationModule],
  controllers: [MonitoringController],
  providers: [HealthService, AlertsService, ReconciliationService, MonitoringScheduler],
  exports: [HealthService],
})
export class MonitoringModule {}
