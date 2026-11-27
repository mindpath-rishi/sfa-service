import { SetMetadata } from '@nestjs/common';

export const BACK_OFFICE_ONLY_KEY = 'backOfficeOnly';

/**
 * Restrict an endpoint to back-office users (ADMIN / SUPER_ADMIN).
 * Every other role (SALESMAN, TEAM_LEADER, MANAGER, ...) is rejected by BackOfficeOnlyGuard.
 *
 * Works alongside the global PermissionsGuard: admin actions
 * (approvals, admin edits, audit logs) stay closed to field users
 * even if a field role is granted the permission.
 */
export const BackOfficeOnly = () => SetMetadata(BACK_OFFICE_ONLY_KEY, true);
