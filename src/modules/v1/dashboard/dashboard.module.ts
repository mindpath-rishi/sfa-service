import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Customer, CustomerSchema } from 'src/core/database/mongo/schema/customer.schema';
import { Payment, PaymentSchema } from 'src/core/database/mongo/schema/payment.schema';
import { RouteSession, RouteSessionSchema } from 'src/core/database/mongo/schema/route-session.schema';
import { Sale, SaleSchema } from 'src/core/database/mongo/schema/sale.schema';
import { VanDailyStock, VanDailyStockSchema } from 'src/core/database/mongo/schema/van-daily-stock.schema';
import { WorkSession, WorkSessionSchema } from 'src/core/database/mongo/schema/work-session.schema';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Sale.name, schema: SaleSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: RouteSession.name, schema: RouteSessionSchema },
      { name: WorkSession.name, schema: WorkSessionSchema },
      { name: VanDailyStock.name, schema: VanDailyStockSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
