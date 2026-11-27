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
import { isSuperAdmin } from './super-admin.guard';

import { EmployeeService } from 'src/modules/v1/employee/employee.service';
import { RoleService } from 'src/modules/v1/role/role.service';
import { Status } from 'src/shared/enums/app.enums';
import { UserStatus } from 'src/modules/v1/user/user.enum';
import { PositionService } from 'src/modules/v1/position/position.service';

type AuthUser = { userId?: string; role?: unknown; roleId?: unknown };
type Access = { allowAll: boolean; permissions: Set<string> };

/** Resolved access is cached briefly so each request is not 3 DB reads. */
const CACHE_TTL_MS = 30_000;

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly cache = new Map<
    string,
    { expires: number; access: Promise<Access> }
  >();

  constructor(
    private readonly reflector: Reflector,
    private readonly employeeService: EmployeeService,
    private readonly roleService: RoleService,
    private readonly positionService: PositionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      targets,
    );
    if (!required?.length) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!user?.userId) {
      throw new UnauthorizedException('Unauthorized access');
    }

    const access = await this.getAccess(user);
    if (access.allowAll || required.every((p) => access.permissions.has(p))) {
      return true;
    }
    throw new ForbiddenException(
      'You do not have permission to access this resource',
    );
  }

  private getAccess(user: AuthUser): Promise<Access> {
    const userId = user.userId as string;
    const now = Date.now();
    const hit = this.cache.get(userId);
    if (hit && hit.expires > now) return hit.access;

    const access = this.loadAccess(user);
    this.cache.set(userId, { expires: now + CACHE_TTL_MS, access });
    // Never cache a failed lookup.
    access.catch(() => this.cache.delete(userId));
    return access;
  }

  private async loadAccess(user: AuthUser): Promise<Access> {
    const userId = user.userId as string;

    // Employee record is optional: it only adds status and overrides.
    const employee = await this.employeeService.findOne(
      { employeeId: userId, isDeleted: false },
      { lean: true },
    );
    if (employee && employee.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Employee account is inactive');
    }

    // Current role comes from the position; the token's role is the fallback.
    const position = await this.positionService.findOne(
      { employeeId: userId, isDeleted: false },
      { lean: true },
    );
    const roleId =
      position?.roleId ??
      (typeof user.roleId === 'string' ? user.roleId : undefined);
    if (!roleId) throw new ForbiddenException('Position role not found');

    const role = await this.roleService.findOne(
      { roleId, isDeleted: false },
      { lean: true },
    );
    if (!role) throw new ForbiddenException('Role not found');
    if (role.status !== Status.ACTIVE) {
      throw new ForbiddenException('Role is inactive');
    }

    // SUPER_ADMIN has every permission; ADMIN gets its keys from the seeder.
    if (role.isSystemAdmin === true || isSuperAdmin(role.name, role.roleId)) {
      return { allowAll: true, permissions: new Set() };
    }

    // Role permissions, then employee allow, then employee deny (highest).
    const permissions = new Set<string>(role.permissions || []);
    for (const p of employee?.permissionOverrides?.allow || []) {
      permissions.add(p);
    }
    for (const p of employee?.permissionOverrides?.deny || []) {
      permissions.delete(p);
    }
    return { allowAll: false, permissions };
  }
}
