
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { VanDailyStock, VanDailyStockSchema } from 'src/core/database/mongo/schema/van-daily-stock.schema';
import { VanDailyStockController } from './van-daily-stock.controller';
import { VanDailyStockService } from './van-daily-stock.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: VanDailyStock.name, schema: VanDailyStockSchema }]),
  ],
  controllers: [VanDailyStockController],
  providers: [VanDailyStockService],
  exports: [VanDailyStockService],
})
export class VanDailyStockModule {}
