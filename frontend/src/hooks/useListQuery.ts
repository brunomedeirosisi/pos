import { useEffect, useState } from "react";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { currentSessionGeneration } from "../lib/session-lifecycle";
import { hasValidDateFilters } from "../utils/date";
import {
  listPage,
  type ListFilters,
  type Page,
  type PaginationMeta,
} from "../services/lists";

/** Query cache is cleared at authentication boundaries. Retain navigation on detail/back. */
export function useListState<T>(key: string, initial: T | (() => T)) {
  const client = useQueryClient();
  const queryKey = ["list-state", currentSessionGeneration(), key];
  const state = useQuery({
    queryKey,
    queryFn: () =>
      typeof initial === "function" ? (initial as () => T)() : initial,
    initialData: initial,
    enabled: false,
    gcTime: Infinity,
  });
  const identity = JSON.stringify(queryKey);
  // Controlled inputs update synchronously; the cache retains state across unmounts.
  const [local, setLocal] = useState({ identity, value: state.data as T });
  const setState = (value: T | ((current: T) => T)) => {
    const current = client.getQueryData<T>(queryKey) ?? (state.data as T);
    const next =
      typeof value === "function"
        ? (value as (current: T) => T)(current)
        : value;
    setLocal({ identity, value: next });
    client.setQueryData<T>(queryKey, next);
  };
  return [
    local.identity === identity ? local.value : (state.data as T),
    setState,
  ] as const;
}

export type ListControls = {
  pagination?: PaginationMeta;
  isFetching: boolean;
  isError: boolean;
  enabled?: boolean;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  refetch: () => unknown;
};

export function useListQuery<T>(options: {
  queryKey: QueryKey;
  resource: string;
  filters?: ListFilters;
  enabled?: boolean;
  stateKey?: string;
  refetchInterval?: number | false;
  fetchPage?: (input: ListFilters) => Promise<Page<T>>;
}) {
  const client = useQueryClient();
  const filters = options.filters ?? {};
  const signature = JSON.stringify(
    Object.entries(filters)
      .filter(([, v]) => v !== undefined && v !== "")
      .sort(),
  );
  const [state, setState] = useListState(
    options.stateKey ?? String(options.queryKey[0]),
    { page: 1, pageSize: 25, signature },
  );
  const page = state.signature === signature ? state.page : 1;
  const input = { ...filters, page, pageSize: state.pageSize };
  const enabled = options.enabled !== false && hasValidDateFilters(filters);
  const queryKey = [...options.queryKey, "page", input];
  const result = useQuery({
    queryKey,
    queryFn: () =>
      options.fetchPage
        ? options.fetchPage(input)
        : listPage<T>(options.resource, input),
    enabled,
    refetchInterval: options.refetchInterval,
    staleTime: 10_000,
  });
  useEffect(() => {
    if (state.signature !== signature)
      setState((current) => ({ ...current, page: 1, signature }));
    else if (result.data && result.data.pagination.page !== page) {
      const corrected = result.data.pagination.page;
      client.setQueryData(
        [...options.queryKey, "page", { ...input, page: corrected }],
        result.data,
      );
      setState((current) => ({ ...current, page: corrected }));
    }
  }, [signature, state.signature, page, result.data]);
  return {
    ...result,
    data: result.data?.items,
    pagination: result.data?.pagination,
    response: result.data,
    enabled,
    setPage: (next: number) =>
      setState((current) => ({
        ...current,
        page: Math.max(1, next),
        signature,
      })),
    setPageSize: (size: number) =>
      setState((current) => ({
        ...current,
        page: 1,
        pageSize: size,
        signature,
      })),
  };
}
