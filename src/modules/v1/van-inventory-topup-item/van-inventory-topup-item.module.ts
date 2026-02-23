
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { VanInventoryTopupItem, VanInventoryTopupItemSchema } from 'src/core/database/mongo/schema/van-inventory-topup-item.schema';
import { VanInventoryTopupItemController } from './van-inventory-topup-item.controller';
import { VanInventoryTopupItemService } from './van-inventory-topup-item.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: VanInventoryTopupItem.name, schema: VanInventoryTopupItemSchema }]),
  ],
  controllers: [VanInventoryTopupItemController],
  providers: [VanInventoryTopupItemService],
  exports: [VanInventoryTopupItemService],
})
export class VanInventoryTopupItemModule {}
