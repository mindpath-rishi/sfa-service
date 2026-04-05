import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  ShopVisit,
  ShopVisitSchema,
} from 'src/core/database/mongo/schema/shop-visit.schema';
import { ShopVisitController } from './shop-visit.controller';
import { ShopVisitService } from './shop-visit.service';
import { CustomerModule } from '../customer/customer.module';
import { RouteSessionModule } from '../route-session/route-session.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ShopVisit.name, schema: ShopVisitSchema },
    ]),
    CustomerModule,
    RouteSessionModule
  ],
  controllers: [ShopVisitController],
  providers: [ShopVisitService],
  exports: [ShopVisitService],
})
export class ShopVisitModule {}
