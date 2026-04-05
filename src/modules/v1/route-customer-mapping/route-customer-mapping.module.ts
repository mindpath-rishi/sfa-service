
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { RouteCustomerMapping, RouteCustomerMappingSchema } from 'src/core/database/mongo/schema/route-customer-mapping.schema';
import { RouteCustomerMappingController } from './route-customer-mapping.controller';
import { RouteCustomerMappingService } from './route-customer-mapping.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: RouteCustomerMapping.name, schema: RouteCustomerMappingSchema }]),
  ],
  controllers: [RouteCustomerMappingController],
  providers: [RouteCustomerMappingService],
  exports: [RouteCustomerMappingService],
})
export class RouteCustomerMappingModule {}
