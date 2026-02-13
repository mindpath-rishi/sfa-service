import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Defines permissions required to access an API.
 * Example: @Permissions('CUSTOMER_VIEW', 'CUSTOMER_CREATE')
 */
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
