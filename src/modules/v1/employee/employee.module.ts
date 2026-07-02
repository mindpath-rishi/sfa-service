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
import {
  ShopVisit,
  ShopVisitSchema,
} from 'src/core/database/mongo/schema/shop-visit.schema';
import {
  Activity,
  ActivitySchema,
} from 'src/core/database/mongo/schema/activity.schema';
import {
  Leave,
  LeaveSchema,
} from 'src/core/database/mongo/schema/leave.schema';
import {
  Target,
  TargetSchema,
} from 'src/core/database/mongo/schema/target.schema';
import {
  RouteCustomerMappingSchema,
  RouteCustomerMapping,
} from 'src/core/database/mongo/schema/route-customer-mapping.schema';
import {
  Route,
  RouteSchema,
} from 'src/core/database/mongo/schema/route.schema';
import {
  Customer,
  CustomerSchema,
} from 'src/core/database/mongo/schema/customer.schema';
import { Van, VanSchema } from 'src/core/database/mongo/schema/van.schema';
import {
  NonSale,
  NonSaleSchema,
} from 'src/core/database/mongo/schema/non-sale.schema';
import {
  SaleItem,
  SaleItemSchema,
} from 'src/core/database/mongo/schema/sale-item.schema';
import {
  WorkSession,
  WorkSessionSchema,
} from 'src/core/database/mongo/schema/work-session.schema';
import {
  RouteSession,
  RouteSessionSchema,
} from 'src/core/database/mongo/schema/route-session.schema';
import {
  VanDailyStock,
  VanDailyStockSchema,
} from 'src/core/database/mongo/schema/van-daily-stock.schema';
import { Role, RoleSchema } from 'src/core/database/mongo/schema/role.schema';
import {
  Designation,
  DesignationSchema,
} from 'src/core/database/mongo/schema/designation.schema';
import { User, UserSchema } from 'src/core/database/mongo/schema/user.schema';
import {
  FocusedPackTarget,
  FocusedPackTargetSchema,
} from 'src/core/database/mongo/schema/focused-pack-target.schema';
import { LiveLocationModule } from '../live-location/live-location.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Employee.name, schema: EmployeeSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Sale.name, schema: SaleSchema },
      { name: ShopVisit.name, schema: ShopVisitSchema },
      { name: Activity.name, schema: ActivitySchema },
      { name: Leave.name, schema: LeaveSchema },
      { name: Target.name, schema: TargetSchema },
      { name: FocusedPackTarget.name, schema: FocusedPackTargetSchema },
      { name: RouteCustomerMapping.name, schema: RouteCustomerMappingSchema },
      { name: Route.name, schema: RouteSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Van.name, schema: VanSchema },
      { name: NonSale.name, schema: NonSaleSchema },
      { name: SaleItem.name, schema: SaleItemSchema },
      { name: WorkSession.name, schema: WorkSessionSchema },
      { name: RouteSession.name, schema: RouteSessionSchema },
      { name: VanDailyStock.name, schema: VanDailyStockSchema },
      { name: Role.name, schema: RoleSchema },
      { name: Designation.name, schema: DesignationSchema },
      { name: User.name, schema: UserSchema },
    ]),
    UserModule,
    LiveLocationModule,
  ],
  controllers: [EmployeeController],
  providers: [EmployeeService],
  exports: [EmployeeService],
})
export class EmployeeModule {}
