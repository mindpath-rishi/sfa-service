
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { StockCountItem, StockCountItemSchema } from 'src/core/database/mongo/schema/stock-count-item.schema';
import { StockCountItemController } from './stock-count-item.controller';
import { StockCountItemService } from './stock-count-item.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: StockCountItem.name, schema: StockCountItemSchema }]),
  ],
  controllers: [StockCountItemController],
  providers: [StockCountItemService],
  exports: [StockCountItemService],
})
export class StockCountItemModule {}
