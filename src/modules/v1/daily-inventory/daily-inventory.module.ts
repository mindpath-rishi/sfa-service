import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  DailyInventory,
  DailyInventorySchema,
} from 'src/core/database/mongo/schema/daily-inventory.schema';
import { DailyInventoryController } from './daily-inventory.controller';
import { DailyInventoryService } from './daily-inventory.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DailyInventory.name, schema: DailyInventorySchema },
    ]),
  ],
  controllers: [DailyInventoryController],
  providers: [DailyInventoryService],
  exports: [DailyInventoryService],
})
export class DailyInventoryModule {}
