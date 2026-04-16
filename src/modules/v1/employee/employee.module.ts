import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { EmployeeController } from './employee.controller';
import { EmployeeService } from './employee.service';
import {
  Employee,
  EmployeeSchema,
} from 'src/core/database/mongo/schema/employee.schema';
import { UserModule } from '../user/user.module';
import {
  Payment,
  PaymentSchema,
} from 'src/core/database/mongo/schema/payment.schema';
import { Sale, SaleSchema } from 'src/core/database/mongo/schema/sale.schema';
import { ShopVisit, ShopVisitSchema } from 'src/core/database/mongo/schema/shop-visit.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Employee.name, schema: EmployeeSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Sale.name, schema: SaleSchema },
      { name: ShopVisit.name, schema: ShopVisitSchema },
    ]),
    UserModule,
  ],
  controllers: [EmployeeController],
  providers: [EmployeeService],
  exports: [EmployeeService],
})
export class EmployeeModule {}
