
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { WorkSession, WorkSessionSchema } from 'src/core/database/mongo/schema/work-session.schema';
import { WorkSessionController } from './work-session.controller';
import { WorkSessionService } from './work-session.service';
import { ActivityModule } from '../activity/activity.module';
import { RouteSessionModule } from '../route-session/route-session.module';


@Module({
  imports: [
    MongooseModule.forFeature([{ name: WorkSession.name, schema: WorkSessionSchema }]),
    ActivityModule,
    RouteSessionModule
  ],
  controllers: [WorkSessionController],
  providers: [WorkSessionService],
  exports: [WorkSessionService],
})
export class WorkSessionModule {}
