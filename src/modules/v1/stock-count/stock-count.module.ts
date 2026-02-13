
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { StockCount, StockCountSchema } from 'src/core/database/mongo/schema/stock-count.schema';
import { StockCountController } from './stock-count.controller';
import { StockCountService } from './stock-count.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: StockCount.name, schema: StockCountSchema }]),
  ],
  controllers: [StockCountController],
  providers: [StockCountService],
  exports: [StockCountService],
})
export class StockCountModule {}
