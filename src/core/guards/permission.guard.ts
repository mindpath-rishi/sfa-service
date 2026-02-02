import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

import { EmployeeService } from 'src/modules/v1/employee/employee.service';
import { RoleService } from 'src/modules/v1/role/role.service';
import { PERMISSIONS_KEY } from '../decorators/permissioin.decorator';
import { AppLogger } from '../logger/app-logger';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly employeeService: EmployeeService,
    private readonly roleService: RoleService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // ✅ 1) Skip permission check for public routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);


    if (isPublic) return true;

    // ✅ 2) If route has no permission decorator, allow by default
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    // ✅ 3) Ensure user is logged in
    if (!user?.userId ||  !user.roleId) {
      throw new ForbiddenException('Unauthorized access');
    }

    // ✅ 4) Load employee profile (profileId = employeeId)
    const employee = await this.employeeService.findOne(
      { employeeId: user.userId, isDeleted: false },
      { lean: true },
    );

    if (!employee) {
      throw new ForbiddenException('Employee profile not found');
    }

    // ✅ 5) Load role permissions
    const role = await this.roleService.findOne(
      { roleId: employee.roleId, isDeleted: false },
      { lean: true },
    );

    if (!role) {
      throw new ForbiddenException('Role not found');
    }

    // ✅ 6) Build final permission list (role perms + overrides)
    const rolePermissions = new Set<string>(role.permissions || []);

    const allowOverrides = new Set<string>(employee.permissionOverrides?.allow || []);
    const denyOverrides = new Set<string>(employee.permissionOverrides?.deny || []);

    // ✅ add allow overrides
    for (const p of allowOverrides) {
      rolePermissions.add(p);
    }

    // ✅ remove deny overrides (deny wins always)
    for (const p of denyOverrides) {
      rolePermissions.delete(p);
    }

    // ✅ 7) Check required permissions
    const hasAll = requiredPermissions.every((p) => rolePermissions.has(p));

    if (!hasAll) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }

    return true;
  }
}
