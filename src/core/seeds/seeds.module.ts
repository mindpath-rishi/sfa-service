import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PermissionsSeeder } from './permission.seeds';
import { Permission, PermissionSchema } from '../database/mongo/schema/permission.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Permission.name, schema: PermissionSchema },
    ]),
  ],
  providers: [PermissionsSeeder],
  exports: [PermissionsSeeder],
})
export class SeedsModule {}
