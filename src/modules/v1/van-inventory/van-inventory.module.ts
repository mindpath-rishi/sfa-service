
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { VanInventory, VanInventorySchema } from 'src/core/database/mongo/schema/van-inventory.schema';
import { VanInventoryController } from './van-inventory.controller';
import { VanInventoryService } from './van-inventory.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: VanInventory.name, schema: VanInventorySchema }]),
  ],
  controllers: [VanInventoryController],
  providers: [VanInventoryService],
  exports: [VanInventoryService],
})
export class VanInventoryModule {}
