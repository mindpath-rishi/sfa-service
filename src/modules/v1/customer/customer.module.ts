import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Customer,
  CustomerSchema,
} from 'src/core/database/mongo/schema/customer.schema';
import { RouteCustomerMappingModule } from '../route-customer-mapping/route-customer-mapping.module';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import {
  ShopVisit,
  ShopVisitSchema,
} from 'src/core/database/mongo/schema/shop-visit.schema';
import { Sale, SaleSchema } from 'src/core/database/mongo/schema/sale.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: ShopVisit.name, schema: ShopVisitSchema },
      { name: Sale.name, schema: SaleSchema },
    ]),
    RouteCustomerMappingModule,
  ],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
