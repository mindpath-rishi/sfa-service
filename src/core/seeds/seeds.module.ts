import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PermissionsSeeder } from './permission.seeds';
import {
  Permission,
  PermissionSchema,
} from '../database/mongo/schema/permission.schema';
import { Role, RoleSchema } from '../database/mongo/schema/role.schema';
import { SuperAdminSeeder } from './super-admin.seeds';
import { RoleSeeder } from './role.seed';
import {
  Employee,
  EmployeeSchema,
} from '../database/mongo/schema/employee.schema';
import { SeederRunner } from './seed.runner';
import { EmployeeService } from 'src/modules/v1/employee/employee.service';
import { RoleService } from 'src/modules/v1/role/role.service';
import { RoleModule } from 'src/modules/v1/role/role.module';
import { EmployeeModule } from 'src/modules/v1/employee/employee.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Permission.name, schema: PermissionSchema },
      { name: Role.name, schema: RoleSchema },
      {
        name: Employee.name,
        schema: EmployeeSchema,
      },
    ]),
    RoleModule,
    EmployeeModule,
  ],
  providers: [PermissionsSeeder, SuperAdminSeeder, RoleSeeder, SeederRunner],
  exports: [SeederRunner],
})
export class SeedsModule {}
