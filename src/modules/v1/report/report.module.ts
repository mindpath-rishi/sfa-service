import { Module } from '@nestjs/common';
import { EmployeeModule } from '../employee/employee.module';
import { ReportController } from './report.controller';

@Module({
  imports: [EmployeeModule],
  controllers: [ReportController],
})
export class ReportModule {}
