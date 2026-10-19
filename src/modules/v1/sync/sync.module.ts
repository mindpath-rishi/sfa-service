import { Module } from '@nestjs/common';

import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncIssuesController } from './sync-issues.controller';
import { SyncIssuesService } from './sync-issues.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [SyncController, SyncIssuesController],
  providers: [SyncService, SyncIssuesService],
  exports: [SyncService],
})
export class SyncModule {}
