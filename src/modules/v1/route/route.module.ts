
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Route, RouteSchema } from 'src/core/database/mongo/schema/route.schema';
import { RouteController } from './route.controller';
import { RouteService } from './route.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Route.name, schema: RouteSchema }]),
  ],
  controllers: [RouteController],
  providers: [RouteService],
  exports: [RouteService],
})
export class RouteModule {}
