import { Injectable } from "@nestjs/common";
import { EmployeeService } from "src/modules/v1/employee/employee.service";

@Injectable()
export class SuperAdminSeeder {
  constructor(private readonly employeeService: EmployeeService) {}

  async seed(superAdminRoleId: string): Promise<void> {
    try {
      await this.employeeService.create({
        name: 'System Super Admin',
        loginId: 'superadmin',
        mobile: '9999999999',
        email: 'admin@company.com',
        password: 'ChangeMe@123',
        roleId: superAdminRoleId,
        permissionOverrides: {
          allow: [],
          deny: [],
        },
      });
    } catch (err: any) {
      if (err?.status !== 409) throw err;
    }
  }
}
