import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { SaleItemController } from './sale-item.controller';
import { SaleItemService } from './sale-item.service';
import { SaleItem, SaleItemSchema } from 'src/core/database/mongo/schema/sale-item.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SaleItem.name, schema: SaleItemSchema },
    ]),
  ],
  controllers: [SaleItemController],
  providers: [SaleItemService],
  exports: [SaleItemService],
})
export class SaleItemModule {}
