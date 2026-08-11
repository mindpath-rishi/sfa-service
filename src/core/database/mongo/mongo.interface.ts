import type { QueryFilter } from 'mongoose';

export interface SoftDelete {
  isDeleted?: boolean;
}

export type FilterQuery<T> = QueryFilter<T>;
