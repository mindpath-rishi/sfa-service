import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  WorkSession,
  WorkSessionSchema,
} from 'src/core/database/mongo/schema/work-session.schema';
import { WorkSessionController } from './work-session.controller';
import { WorkSessionService } from './work-session.service';
import { ActivityModule } from '../activity/activity.module';
import { RouteSessionModule } from '../route-session/route-session.module';
import { StockCountModule } from '../stock-count/stock-count.module';
import { StockCountItemModule } from '../stock-count-item/stock-count-item.module';
import { VanDailyStockModule } from '../van-daily-stock/van-daily-stock.module';
import { LeaveModule } from '../leave/leave.module';
import { StockUnloadRequestModule } from '../stock-unload-request/stock-unload-request.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkSession.name, schema: WorkSessionSchema },
    ]),
    ActivityModule,
    RouteSessionModule,
    StockCountModule,
    StockCountItemModule,
    VanDailyStockModule,
    LeaveModule,
    StockUnloadRequestModule,
  ],
  controllers: [WorkSessionController],
  providers: [WorkSessionService],
  exports: [WorkSessionService],
})
export class WorkSessionModule {}
