import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  ProductivityReport,
  ProductivityReportSchema,
} from 'src/core/database/mongo/schema/productivity-report.schema';

import { EmployeeModule } from '../employee/employee.module';

import { ReportController } from './report.controller';
import { ReportService } from './report.service';

@Module({
  imports: [
    EmployeeModule,

    MongooseModule.forFeature([
      {
        name: ProductivityReport.name,
        schema: ProductivityReportSchema,
      },
    ]),
  ],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
