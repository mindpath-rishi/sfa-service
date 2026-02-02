import { ClientSession, QueryOptions } from "mongoose";

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sort?: Record<string, 1 | -1>;
}

export interface RepoOptions extends QueryOptions {
  session?: ClientSession;
  includeDeleted?: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
