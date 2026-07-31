import { Injectable } from '@nestjs/common';
import { SYSTEM_POSITION_ID } from 'src/modules/v1/employee/employee.constants';
import { EmployeeService } from 'src/modules/v1/employee/employee.service';
import { PositionService } from 'src/modules/v1/position/position.service';
import { PositionStatus } from 'src/shared/enums/position.enums';

@Injectable()
export class SuperAdminSeeder {
  constructor(
    private readonly employeeService: EmployeeService,
    private readonly positionService: PositionService,
  ) {}

  async seed(superAdminRoleId: string): Promise<void> {
    let systemEmployeeId = 'SYSTEM_ADMIN';
    try {
      const result = await this.employeeService.create({
        employeeId: systemEmployeeId,
        name: 'System Super Admin',
        loginId: 'superadmin',
        mobile: '9999999999',
        email: 'admin@company.com',
        password: 'ChangeMe@123',
        permissionOverrides: {
          allow: [],
          deny: [],
        },
      });
      systemEmployeeId = String(
        (result.data as { employeeId?: string })?.employeeId ||
          systemEmployeeId,
      );
    } catch (err: any) {
      if (err?.status !== 409) throw err;
      const existing = await this.employeeService.findOne(
        {
          $or: [
            { employeeId: systemEmployeeId },
            { mobile: '9999999999' },
            { email: 'admin@company.com' },
          ],
        },
        { includeDeleted: true, lean: true },
      );
      if (!existing?.employeeId) throw err;
      systemEmployeeId = existing.employeeId;
    }

    try {
      const systemPosition = await this.positionService.findOne(
        { positionId: SYSTEM_POSITION_ID },
        { includeDeleted: true },
      );
      if (systemPosition) {
        await this.positionService.updateOne(
          { positionId: SYSTEM_POSITION_ID },
          {
            roleId: superAdminRoleId,
            employeeId: systemEmployeeId,
            status: PositionStatus.ACTIVE,
            isDeleted: false,
          },
        );
      } else {
        await this.positionService.save({
          positionId: SYSTEM_POSITION_ID,
          name: 'System',
          countryId: SYSTEM_POSITION_ID,
          provinceId: SYSTEM_POSITION_ID,
          marketId: SYSTEM_POSITION_ID,
          roleId: superAdminRoleId,
          employeeId: systemEmployeeId,
          vanIds: [],
          status: PositionStatus.ACTIVE,
        });
      }
    } catch (err: any) {
      if (err?.status !== 409) throw err;
    }
  }
}
