
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { RouteSession, RouteSessionSchema } from 'src/core/database/mongo/schema/route-session.schema';
import { RouteSessionController } from './route-session.controller';
import { RouteSessionService } from './route-session.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: RouteSession.name, schema: RouteSessionSchema }]),
  ],
  controllers: [RouteSessionController],
  providers: [RouteSessionService],
  exports: [RouteSessionService],
})
export class RouteSessionModule {}
