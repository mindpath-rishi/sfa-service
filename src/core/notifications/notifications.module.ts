import { Module } from '@nestjs/common';
import { NotificationProvider } from './notifications.provider';

@Module({
  providers: [NotificationProvider],
  exports: [NotificationProvider],
})
export class NotificationCoreModule {}
