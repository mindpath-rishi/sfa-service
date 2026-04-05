import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  VanInventoryTopup,
  VanInventoryTopupSchema,
} from 'src/core/database/mongo/schema/van-inventory-topup.schema';
import { VanInventoryTopupController } from './van-inventory-topup.controller';
import { VanInventoryTopupService } from './van-inventory-topup.service';
import { ProductModule } from '../product/product.module';
import { VanInventoryTopupItemModule } from '../van-inventory-topup-item/van-inventory-topup-item.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VanInventoryTopup.name, schema: VanInventoryTopupSchema },
    ]),
    ProductModule,
    VanInventoryTopupItemModule
  ],
  controllers: [VanInventoryTopupController],
  providers: [VanInventoryTopupService],
  exports: [VanInventoryTopupService],
})
export class VanInventoryTopupModule {}
