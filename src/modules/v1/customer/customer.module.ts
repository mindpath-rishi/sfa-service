import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Customer,
  CustomerSchema,
} from 'src/core/database/mongo/schema/customer.schema';
import { RouteCustomerMappingModule } from '../route-customer-mapping/route-customer-mapping.module';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
    ]),
    RouteCustomerMappingModule,
  ],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
