import { Injectable } from "@nestjs/common";
import { RoleService } from "src/modules/v1/role/role.service";

@Injectable()
export class RoleSeeder {
  constructor(private readonly roleService: RoleService) {}

  async seed(): Promise<{ superAdminRoleId: string }> {
    let role;

    try {
      role = await this.roleService.create({
        name: 'Super Admin',
        description: 'System owner with full privileges',
        permissions: [],
        maxAssociatedVans: -1,
        isSystemAdmin: true,
      });
    } catch (err: any) {
      if (err?.status !== 409) throw err;

      // Already exists → fetch it
      role = await this.roleService.findOne(
        { isSystemAdmin: true },
        { lean: true },
      );
    }

    console.log(role, "============ROLE================");

    return {
      superAdminRoleId: role.roleId,
    };
  }
}
