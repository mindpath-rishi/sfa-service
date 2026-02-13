
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { StockSalesItem, StockSalesItemSchema } from 'src/core/database/mongo/schema/stock-sales-item.schema';
import { StockSalesItemController } from './stock-sales-item.controller';
import { StockSalesItemService } from './stock-sales-item.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: StockSalesItem.name, schema: StockSalesItemSchema }]),
  ],
  controllers: [StockSalesItemController],
  providers: [StockSalesItemService],
  exports: [StockSalesItemService],
})
export class StockSalesItemModule {}
