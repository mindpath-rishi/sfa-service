import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  userId?: string;
  name?: string;
  role?: string;
  vanId?: string;
  vanName?: string;
}

export const RequestContextStore =
  new AsyncLocalStorage<RequestContext>();
