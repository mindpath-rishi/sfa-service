import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  VanChangeRequest,
  VanChangeRequestSchema,
} from 'src/core/database/mongo/schema/van-change-request.schema';
import { NotificationModule } from '../notification/notification.module';
import { VanModule } from '../van/van.module';
import { WorkSessionModule } from '../work-session/work-session.module';
import { VanChangeRequestController } from './van-change-request.controller';
import { VanChangeRequestService } from './van-change-request.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VanChangeRequest.name, schema: VanChangeRequestSchema },
    ]),
    WorkSessionModule,
    VanModule,
    NotificationModule,
  ],
  controllers: [VanChangeRequestController],
  providers: [VanChangeRequestService],
  exports: [VanChangeRequestService],
})
export class VanChangeRequestModule {}
