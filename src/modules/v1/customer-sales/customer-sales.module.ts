
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CustomerSales, CustomerSalesSchema } from 'src/core/database/mongo/schema/customer-sales.schema';
import { CustomerSalesController } from './customer-sales.controller';
import { CustomerSalesService } from './customer-sales.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CustomerSales.name, schema: CustomerSalesSchema }]),
  ],
  controllers: [CustomerSalesController],
  providers: [CustomerSalesService],
  exports: [CustomerSalesService],
})
export class CustomerSalesModule {}
