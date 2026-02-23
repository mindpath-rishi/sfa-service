
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CustomerSalesItem, CustomerSalesItemSchema } from 'src/core/database/mongo/schema/customer-sales-item.schema';
import { CustomerSalesItemController } from './customer-sales-item.controller';
import { CustomerSalesItemService } from './customer-sales-item.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CustomerSalesItem.name, schema: CustomerSalesItemSchema }]),
  ],
  controllers: [CustomerSalesItemController],
  providers: [CustomerSalesItemService],
  exports: [CustomerSalesItemService],
})
export class CustomerSalesItemModule {}
