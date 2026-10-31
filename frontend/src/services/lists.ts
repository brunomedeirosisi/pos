import { http } from "../api";

export type PaginationMeta = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};
export type Page<T> = {
  items: T[];
  summary?: unknown;
  pagination: PaginationMeta;
};
export type ListFilters = Record<string, string | number | boolean | undefined>;
export type PageInput = {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};

export function listPage<T>(
  resource: string,
  input: PageInput & ListFilters = {},
): Promise<Page<T>> {
  return http.get<Page<T>>(`/lists/${resource}`, input);
}
