import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Route,
  RouteSchema,
} from 'src/core/database/mongo/schema/route.schema';
import { RouteController } from './route.controller';
import { RouteService } from './route.service';
import { CustomerModule } from '../customer/customer.module';
import { RouteCustomerMappingModule } from '../route-customer-mapping/route-customer-mapping.module';
import { ShopVisitModule } from '../shop-visit/shop-visit.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Route.name, schema: RouteSchema }]),
    CustomerModule,
    RouteCustomerMappingModule,
    ShopVisitModule,
  ],
  controllers: [RouteController],
  providers: [RouteService],
  exports: [RouteService],
})
export class RouteModule {}
