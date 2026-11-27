import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  ALL_PERMISSIONS,
  FIELD_PERMISSIONS,
  FIELD_ROLES,
} from 'src/shared/constants/role-permissions.constants';
import { Role } from '../database/mongo/schema/role.schema';

/**
 * Grants every role the permissions its routes need, so the global
 * PermissionsGuard does not lock anyone out.
 * - ADMIN: every permission
 * - MANAGER / TEAM_LEADER / SALESMAN: permissions of field (non back-office) routes
 *
 * Only ever adds ($addToSet); permissions removed by hand in MIS for other
 * keys are left alone. SUPER_ADMIN bypasses the guard and is not touched.
 */
@Injectable()
export class RolePermissionsSeeder {
  private readonly logger = new Logger(RolePermissionsSeeder.name);

  constructor(
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
  ) {}

  async seed(): Promise<void> {
    await this.grant(['ADMIN'], ALL_PERMISSIONS);
    await this.grant([...FIELD_ROLES], FIELD_PERMISSIONS);
  }

  private async grant(roleIds: string[], permissions: readonly string[]) {
    const res = await this.roleModel.updateMany(
      { roleId: { $in: roleIds }, isDeleted: { $ne: true } },
      { $addToSet: { permissions: { $each: [...permissions] } } },
    );
    this.logger.log(
      `Role permissions: ${roleIds.join(', ')} -> ${permissions.length} keys (${res.modifiedCount} updated)`,
    );
  }
}
