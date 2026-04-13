import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SalesController } from './sale.controller';
import { SaleService } from './sale.service';
import { Sale, SaleSchema } from 'src/core/database/mongo/schema/sale.schema';
import { SaleItemModule } from '../sale-item/sale-item.module';
import { PaymentModule } from '../payment/payment.module';
import { ProductModule } from '../product/product.module';
import { VanInventoryModule } from '../van-inventory/van-inventory.module';
import { InventoryTransactionModule } from '../inventory-transaction/inventory-transaction.module';
import { CustomerModule } from '../customer/customer.module';
import { VanDailyStockModule } from '../van-daily-stock/van-daily-stock.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Sale.name, schema: SaleSchema }]),
    SaleItemModule,
    PaymentModule,
    ProductModule,
    VanInventoryModule,
    InventoryTransactionModule,
    CustomerModule,
    VanDailyStockModule,
  ],
  controllers: [SalesController],
  providers: [SaleService],
  exports: [SaleService],
})
export class SaleModule {}
