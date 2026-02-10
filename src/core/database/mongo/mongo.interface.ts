export interface SoftDelete {
  isDeleted?: boolean;
}

export type FilterQuery<T> = Partial<T> & Record<string, any>;
