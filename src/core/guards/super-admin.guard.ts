import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * "SUPER_ADMIN" in most databases; the role seeder names it "Super Admin".
 */
export const isSuperAdmin = (role?: unknown, roleId?: unknown) =>
  [role, roleId].some(
    (value) =>
      String(value ?? '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '_') === 'SUPER_ADMIN',
  );

/** Developer tooling (system logs, sync repair) is limited to Super Admin. */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user;
    if (!isSuperAdmin(user?.role, user?.roleId)) {
      throw new ForbiddenException('Only Super Admin can access this');
    }
    return true;
  }
}
