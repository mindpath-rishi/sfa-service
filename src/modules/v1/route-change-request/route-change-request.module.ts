import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  RouteChangeRequest,
  RouteChangeRequestSchema,
} from 'src/core/database/mongo/schema/route-change-request.schema';
import { NotificationModule } from '../notification/notification.module';
import { RouteModule } from '../route/route.module';
import { RouteSessionModule } from '../route-session/route-session.module';
import { VanModule } from '../van/van.module';
import { WorkSessionModule } from '../work-session/work-session.module';
import { RouteChangeRequestController } from './route-change-request.controller';
import { RouteChangeRequestService } from './route-change-request.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RouteChangeRequest.name, schema: RouteChangeRequestSchema },
    ]),
    WorkSessionModule,
    RouteSessionModule,
    RouteModule,
    VanModule,
    NotificationModule,
  ],
  controllers: [RouteChangeRequestController],
  providers: [RouteChangeRequestService],
})
export class RouteChangeRequestModule {}
