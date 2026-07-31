import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  StockUnloadRequest,
  StockUnloadRequestSchema,
} from 'src/core/database/mongo/schema/stock-unload-request.schema';
import { InventoryTransactionModule } from '../inventory-transaction/inventory-transaction.module';
import { NotificationModule } from '../notification/notification.module';
import { VanInventoryModule } from '../van-inventory/van-inventory.module';
import { StockUnloadRequestController } from './stock-unload-request.controller';
import { StockUnloadRequestService } from './stock-unload-request.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StockUnloadRequest.name, schema: StockUnloadRequestSchema },
    ]),
    InventoryTransactionModule,
    VanInventoryModule,
    NotificationModule,
  ],
  controllers: [StockUnloadRequestController],
  providers: [StockUnloadRequestService],
  exports: [StockUnloadRequestService],
})
export class StockUnloadRequestModule {}
