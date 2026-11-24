import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  userId?: string;
  name?: string;
  role?: string;
  roleId?: string;
  vanId?: string;
  vanName?: string;
  /** Device the request comes from (from the access token) */
  deviceId?: string;
  offlineAccessAllowed?: boolean;
}

export const RequestContextStore =
  new AsyncLocalStorage<RequestContext>();
