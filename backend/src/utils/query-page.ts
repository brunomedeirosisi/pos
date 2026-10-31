import { z } from "zod";
import type { PoolClient } from "pg";
import { query } from "../db.js";
import { badRequest } from "../errors.js";

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(2147483647).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.string().max(64).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;
export type Page<T> = {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  totals?: Record<string, number>;
};

/** SQL fragments and sort expressions must be application constants, never request text.
 * Count and page share one statement snapshot. Clamp before OFFSET, including empty sets.
 * NOT MATERIALIZED lets PostgreSQL count without evaluating expensive row projections.
 */
export async function queryPage<T>(options: {
  sql: string;
  params?: unknown[];
  sorts: Record<string, string>;
  defaultSort: string;
  defaultOrder?: "asc" | "desc";
  tieBreaker?: string;
  tieBreakerOrder?: "asc" | "desc";
  input: PageQuery;
  aggregates?: Record<string, string>;
  itemExpression?: string;
  materialized?: boolean;
  client?: PoolClient;
}): Promise<Page<T>> {
  const { input, sorts } = options;
  const sort = input.sortBy ?? options.defaultSort;
  if (!Object.hasOwn(sorts, sort)) throw badRequest("invalid_sort_field");
  const direction = input.sortOrder ?? options.defaultOrder ?? "asc";
  const order = `${sorts[sort]} ${direction} nulls last, ${options.tieBreaker ?? "id"} ${options.tieBreakerOrder ?? direction}`;
  const params = [...(options.params ?? []), input.page, input.pageSize];
  const pageParam = `$${params.length - 1}`;
  const sizeParam = `$${params.length}`;
  const aggregates = Object.entries(options.aggregates ?? {}).map(
    ([key, expression]) => `${expression} as "${key}"`,
  );
  const { rows } = await query<{
    items: T[];
    page: number;
    total_items: string;
    totals: Record<string, number>;
  }>(
    `with source as ${options.materialized ? "materialized" : "not materialized"} (${options.sql}),
     totals as (select count(*) as total_items ${aggregates.length ? `,${aggregates.join(",")}` : ""} from source),
     meta as (select totals.*, least(${pageParam}::bigint,
       greatest(1,ceil(total_items::numeric/${sizeParam}::int)))::int as page from totals)
     select meta.total_items::text, meta.page, to_jsonb(meta)-'page'-'total_items' as totals, coalesce(paged.items,'[]'::jsonb) as items
     from meta cross join lateral (
       select jsonb_agg(${options.itemExpression ?? "to_jsonb(entry)"} order by ${order}) as items from (
         select * from source order by ${order}
         limit ${sizeParam}::int offset ((meta.page::bigint-1)*${sizeParam}::int)
       ) entry
     ) paged`,
    params,
    options.client,
  );
  const row = rows[0];
  const totalItems = Number(row.total_items);
  return {
    items: row.items,
    ...(aggregates.length ? { totals: row.totals } : {}),
    pagination: {
      page: row.page,
      pageSize: input.pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / input.pageSize)),
    },
  };
}
