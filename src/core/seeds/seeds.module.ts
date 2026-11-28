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
import { RolePermissionsSeeder } from './role-permissions.seed';
import { RoleModule } from 'src/modules/v1/role/role.module';
import { EmployeeModule } from 'src/modules/v1/employee/employee.module';
import { PositionModule } from 'src/modules/v1/position/position.module';

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
    PositionModule,
  ],
  providers: [
    PermissionsSeeder,
    RolePermissionsSeeder,
    SuperAdminSeeder,
    RoleSeeder,
    SeederRunner,
  ],
  exports: [SeederRunner],
})
export class SeedsModule {}
