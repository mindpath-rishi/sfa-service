import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/permission.decorator';

import { EmployeeService } from 'src/modules/v1/employee/employee.service';
import { RoleService } from 'src/modules/v1/role/role.service';
import { Status } from 'src/shared/enums/app.enums';
import { UserStatus } from 'src/modules/v1/user/user.enum';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly employeeService: EmployeeService,
    private readonly roleService: RoleService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    /* ======================================================
     * PUBLIC ROUTES
     * ====================================================== */
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    /* ======================================================
     * REQUIRED PERMISSIONS
     * ====================================================== */
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user;

    /* ======================================================
     * AUTH CONTEXT
     * ====================================================== */
    if (!user?.userId) {
      throw new UnauthorizedException('Unauthorized access');
    }

    /* ======================================================
     * EMPLOYEE VALIDATION
     * ====================================================== */
    const employee = await this.employeeService.findOne(
      { employeeId: user.userId, isDeleted: false },
      { lean: true },
    );

    if (!employee) {
      throw new UnauthorizedException('Employee profile not found');
    }

    if (employee.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Employee account is inactive');
    }

    /* ======================================================
     * ROLE VALIDATION
     * ====================================================== */
    const role = await this.roleService.findOne(
      { roleId: employee.roleId, isDeleted: false },
      { lean: true },
    );

    if (!role) {
      throw new ForbiddenException('Role not found');
    }

    if (role.status !== Status.ACTIVE) {
      throw new ForbiddenException('Role is inactive');
    }

    /* ======================================================
     * SUPER ADMIN BYPASS
     * ====================================================== */
    if (role.name === 'SUPER_ADMIN') {
      return true;
    }

    /* ======================================================
     * PERMISSION RESOLUTION
     * Priority:
     * 1. Role permissions
     * 2. Employee allow overrides
     * 3. Employee deny overrides (highest)
     * ====================================================== */
    const permissions = new Set<string>(role.permissions || []);

    for (const p of employee.permissionOverrides?.allow || []) {
      permissions.add(p);
    }

    for (const p of employee.permissionOverrides?.deny || []) {
      permissions.delete(p);
    }

    /* ======================================================
     * FINAL PERMISSION CHECK
     * ====================================================== */
    const hasAllPermissions = requiredPermissions.every((p) =>
      permissions.has(p),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException(
        'You do not have permission to access this resource',
      );
    }

    return true;
  }
}
