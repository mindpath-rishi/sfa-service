import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BACK_OFFICE_ONLY_KEY } from '../decorators/back-office-only.decorator';

/** Only these roles may call admin-level (back-office) APIs. */
export const BACK_OFFICE_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

const normalizeRole = (value: unknown) =>
  (typeof value === 'string' ? value : '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');

/** True when either the role name or roleId is an admin role. */
export const isBackOfficeUser = (role?: unknown, roleId?: unknown) =>
  [role, roleId].some((value) => BACK_OFFICE_ROLES.has(normalizeRole(value)));

@Injectable()
export class BackOfficeOnlyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const backOfficeOnly = this.reflector.getAllAndOverride<boolean>(
      BACK_OFFICE_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!backOfficeOnly) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { role?: unknown; roleId?: unknown } }>();
    if (!isBackOfficeUser(user?.role, user?.roleId)) {
      throw new ForbiddenException(
        'This action is only available to back-office users',
      );
    }
    return true;
  }
}

/**
 * Mobile app is for field users (SALESMAN / TEAM_LEADER / MANAGER).
 * Admin roles must use the web MIS.
 */
export const hasMobileAppAccess = (
  deviceType: string | undefined,
  role: { name?: unknown; roleId?: unknown; isSystemAdmin?: boolean },
) =>
  deviceType === 'web' ||
  !(role.isSystemAdmin === true || isBackOfficeUser(role.name, role.roleId));
