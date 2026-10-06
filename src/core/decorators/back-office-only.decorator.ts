import { SetMetadata } from '@nestjs/common';

export const BACK_OFFICE_ONLY_KEY = 'backOfficeOnly';

/**
 * Restrict an endpoint to back-office users (admins / managers).
 * Salesman roles are rejected by BackOfficeOnlyGuard.
 *
 * Used while the global PermissionsGuard is disabled, so admin actions
 * (approvals, admin edits, audit logs) are not open to field users.
 */
export const BackOfficeOnly = () => SetMetadata(BACK_OFFICE_ONLY_KEY, true);
