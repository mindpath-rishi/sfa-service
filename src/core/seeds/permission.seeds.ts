import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { PERMISSIONS } from 'src/shared/constants/permissions.constants';
import { ALL_PERMISSIONS } from 'src/shared/constants/role-permissions.constants';
import {
  Permission,
  PermissionDocument,
} from '../database/mongo/schema/permission.schema';

@Injectable()
export class PermissionsSeeder {
  constructor(
    @InjectModel(Permission.name)
    private readonly permissionModel: Model<PermissionDocument>,
  ) {}

  async seed(): Promise<void> {
    // Legacy keys plus every key a controller actually checks.
    const codes = [
      ...new Set<string>([...Object.values(PERMISSIONS), ...ALL_PERMISSIONS]),
    ];
    const allPermissions = codes.map((code) => ({
      code,
      name: code.replaceAll('_', ' '),
      module: code.split('_')[0],
    }));

    for (const p of allPermissions) {
      await this.permissionModel.updateOne(
        { code: p.code },
        { $set: p },
        { upsert: true },
      );
    }
  }
}
