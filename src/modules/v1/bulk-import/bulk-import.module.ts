import { Module } from '@nestjs/common';
import { CustomerModule } from '../customer/customer.module';
import { EmployeeModule } from '../employee/employee.module';
import { MasterBulkModule } from '../master-bulk/master-bulk.module';
import { ProductModule } from '../product/product.module';
import { RouteModule } from '../route/route.module';
import { TargetModule } from '../target/target.module';
import { BulkImportController } from './bulk-import.controller';
import { BulkImportService } from './bulk-import.service';

@Module({
  imports: [
    CustomerModule,
    EmployeeModule,
    RouteModule,
    TargetModule,
    ProductModule,
    MasterBulkModule,
  ],
  controllers: [BulkImportController],
  providers: [BulkImportService],
})
export class BulkImportModule {}
