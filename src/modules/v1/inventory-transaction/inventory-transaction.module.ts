
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { InventoryTransaction, InventoryTransactionSchema } from 'src/core/database/mongo/schema/inventory-transaction.schema';
import { InventoryTransactionController } from './inventory-transaction.controller';
import { InventoryTransactionService } from './inventory-transaction.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: InventoryTransaction.name, schema: InventoryTransactionSchema }]),
  ],
  controllers: [InventoryTransactionController],
  providers: [InventoryTransactionService],
  exports: [InventoryTransactionService],
})
export class InventoryTransactionModule {}
