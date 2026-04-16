import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Payment,
  PaymentSchema,
} from 'src/core/database/mongo/schema/payment.schema';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { CustomerModule } from '../customer/customer.module';
import { Sale, SaleSchema } from 'src/core/database/mongo/schema/sale.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Sale.name, schema: SaleSchema },
    ]),
    CustomerModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
