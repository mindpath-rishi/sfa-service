import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Activity,
  ActivitySchema,
} from 'src/core/database/mongo/schema/activity.schema';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { RouteSessionModule } from '../route-session/route-session.module';
import { VanDailyStockModule } from '../van-daily-stock/van-daily-stock.module';
import { VanInventoryModule } from '../van-inventory/van-inventory.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Activity.name, schema: ActivitySchema },
    ]),
    RouteSessionModule,
    VanDailyStockModule,
    VanInventoryModule,
  ],
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
