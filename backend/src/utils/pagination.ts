import { z } from 'zod';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export type ResolvedPagination = {
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
};

export function resolvePagination(
  input: PaginationQuery,
  options?: {
    defaultPageSize?: number;
    maxPageSize?: number;
  }
): ResolvedPagination {
  const defaultPageSize = options?.defaultPageSize ?? 100;
  const maxPageSize = options?.maxPageSize ?? 200;

  const page = input.page ?? 1;
  const requestedPageSize = input.page_size ?? input.limit ?? defaultPageSize;
  const pageSize = Math.min(Math.max(requestedPageSize, 1), maxPageSize);

  return {
    page,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };
}
