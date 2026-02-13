
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { StockSales, StockSalesSchema } from 'src/core/database/mongo/schema/stock-sales.schema';
import { StockSalesController } from './stock-sales.controller';
import { StockSalesService } from './stock-sales.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: StockSales.name, schema: StockSalesSchema }]),
  ],
  controllers: [StockSalesController],
  providers: [StockSalesService],
  exports: [StockSalesService],
})
export class StockSalesModule {}
