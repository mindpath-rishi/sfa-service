import { Injectable } from "@nestjs/common";
import { RoleService } from "src/modules/v1/role/role.service";

const SUPER_ADMIN_ROLE_NAME = 'Super Admin';

@Injectable()
export class RoleSeeder {
  constructor(private readonly roleService: RoleService) {}

  async seed(): Promise<{ superAdminRoleId: string }> {
    let role = await this.findSuperAdminRole();

    if (!role) {
      try {
        // create() returns a response wrapper (and a boolean when it
        // restores a soft-deleted role), so the role is read back below.
        await this.roleService.create({
          name: SUPER_ADMIN_ROLE_NAME,
          description: 'System owner with full privileges',
          permissions: [],
          isSystemAdmin: true,
        });
      } catch (err: any) {
        if (err?.status !== 409) throw err;
      }

      role = await this.findSuperAdminRole();
    }

    if (!role?.roleId) {
      throw new Error('Super Admin role could not be seeded');
    }

    return {
      superAdminRoleId: role.roleId,
    };
  }

  private async findSuperAdminRole(): Promise<{ roleId?: string } | null> {
    return (await this.roleService.findOne(
      { $or: [{ isSystemAdmin: true }, { name: 'SUPER_ADMIN' }] } as any,
      { lean: true },
    )) as { roleId?: string } | null;
  }
}
