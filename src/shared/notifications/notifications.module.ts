import { Module } from '@nestjs/common';
import { NotificationCoreModule } from 'src/core/notifications/notifications.module';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [NotificationCoreModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
