import { Module } from '@nestjs/common';
import { EmployeeModule } from '../employee/employee.module';
import { ReportController } from './report.controller';
import { MongooseModule } from '@nestjs/mongoose';

import { ReportService } from './report.service';

import {
  ProductivityReport,
  ProductivityReportSchema,
} from 'src/core/database/mongo/schema/productivity-report.schema';

import {
  Employee,
  EmployeeSchema,
} from 'src/core/database/mongo/schema/employee.schema';

import {
  Position,
  PositionSchema,
} from 'src/core/database/mongo/schema/position.schema';

import {
  Country,
  CountrySchema,
} from 'src/core/database/mongo/schema/country.schema';

import {
  Province,
  ProvinceSchema,
} from 'src/core/database/mongo/schema/province.schema';

import {
  WorkSession,
  WorkSessionSchema,
} from 'src/core/database/mongo/schema/work-session.schema';

import {
  ShopVisit,
  ShopVisitSchema,
} from 'src/core/database/mongo/schema/shop-visit.schema';

import { Sale, SaleSchema } from 'src/core/database/mongo/schema/sale.schema';

import {
  SaleItem,
  SaleItemSchema,
} from 'src/core/database/mongo/schema/sale-item.schema';

import {
  RouteSession,
  RouteSessionSchema,
} from 'src/core/database/mongo/schema/route-session.schema';

import {
  RouteCustomerMapping,
  RouteCustomerMappingSchema,
} from 'src/core/database/mongo/schema/route-customer-mapping.schema';

import {
  Customer,
  CustomerSchema,
} from 'src/core/database/mongo/schema/customer.schema';

@Module({
  imports: [
    EmployeeModule,

    MongooseModule.forFeature([
      {
        name: ProductivityReport.name,
        schema: ProductivityReportSchema,
      },
      {
        name: Employee.name,
        schema: EmployeeSchema,
      },
      {
        name: Position.name,
        schema: PositionSchema,
      },
      {
        name: Country.name,
        schema: CountrySchema,
      },
      {
        name: Province.name,
        schema: ProvinceSchema,
      },
      {
        name: WorkSession.name,
        schema: WorkSessionSchema,
      },
      {
        name: ShopVisit.name,
        schema: ShopVisitSchema,
      },
      {
        name: Sale.name,
        schema: SaleSchema,
      },
      {
        name: SaleItem.name,
        schema: SaleItemSchema,
      },
      {
        name: RouteSession.name,
        schema: RouteSessionSchema,
      },
      {
        name: RouteCustomerMapping.name,
        schema: RouteCustomerMappingSchema,
      },
      {
        name: Customer.name,
        schema: CustomerSchema,
      },
    ]),
  ],

  controllers: [ReportController],

  providers: [ReportService],

  exports: [ReportService],
})
export class ReportModule {}
