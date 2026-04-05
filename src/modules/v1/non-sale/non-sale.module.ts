import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  NonSale,
  NonSaleSchema,
} from 'src/core/database/mongo/schema/non-sale.schema';
import { NonSaleController } from './non-sale.controller';
import { NonSaleService } from './non-sale.service';
import { ShopVisitModule } from '../shop-visit/shop-visit.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: NonSale.name, schema: NonSaleSchema }]),
    ShopVisitModule,
  ],
  controllers: [NonSaleController],
  providers: [NonSaleService],
  exports: [NonSaleService],
})
export class NonSaleModule {}
