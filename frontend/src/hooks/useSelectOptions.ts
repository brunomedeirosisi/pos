import { useCallback, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { listPage, type ListFilters } from "../services/lists";
import { useDebouncedValue } from "./useDebouncedValue";

export type SelectOption = { value: string; label: string };

export type SelectOptionsSource = {
  options: SelectOption[];
  optionsKey?: string;
  /** Legacy search-only adapter. Prefer resource for server-side pagination. */
  loadOptions?: (search: string) => Promise<SelectOption[]>;
  resource?: string;
  labelField?: string;
  filters?: ListFilters;
  pageSize?: number;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
};

export function useSelectOptions({
  open,
  disabled,
  search,
  options,
  optionsKey,
  loadOptions,
  resource,
  labelField = "name",
  filters,
  pageSize = 40,
  loading = false,
  error = false,
  onRetry,
}: SelectOptionsSource & { open: boolean; disabled: boolean; search: string }) {
  const term = search.trim();
  const debounced = useDebouncedValue(term, 300);
  const batchSize = Math.max(1, Math.min(100, Math.floor(pageSize) || 40));
  const legacyRemote = !resource && Boolean(term && loadOptions);
  const waiting = Boolean(resource || legacyRemote) && term !== debounced;
  const scope = JSON.stringify([
    resource,
    filters,
    term,
    batchSize,
    optionsKey,
  ]);
  const [window, setWindow] = useState({ scope, size: batchSize });
  if (window.scope !== scope) setWindow({ scope, size: batchSize });
  const limit = window.scope === scope ? window.size : batchSize;
  const pending = useRef<Promise<unknown> | null>(null);

  const remote = useInfiniteQuery({
    queryKey: ["select-options", resource, filters, debounced, batchSize],
    queryFn: ({ pageParam, signal }) =>
      listPage<Record<string, string>>(
        resource!,
        {
          ...filters,
          search: debounced || undefined,
          page: pageParam,
          pageSize: batchSize,
        },
        signal,
      ),
    initialPageParam: 1,
    getNextPageParam: (last, _pages, requestedPage) => {
      const { page, totalPages } = last.pagination;
      // A shrinking result can clamp the requested page backwards. Never loop it.
      return last.items.length > 0 &&
        page === requestedPage &&
        page < totalPages
        ? page + 1
        : undefined;
    },
    enabled: open && Boolean(resource) && !waiting && !disabled,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const legacy = useQuery({
    queryKey: ["history-filter-options", optionsKey, debounced],
    queryFn: () => loadOptions!(debounced),
    enabled: open && legacyRemote && !waiting && !disabled,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const matches = useMemo(() => {
    const rows = resource
      ? (remote.data?.pages ?? []).flatMap((page) =>
          page.items.map((row) => ({ value: row.id, label: row[labelField] })),
        )
      : legacyRemote
        ? (legacy.data ?? [])
        : options.filter((option) =>
            option.label.toLocaleLowerCase().includes(term.toLocaleLowerCase()),
          );
    return Array.from(
      new Map(
        rows.filter((row) => row.value).map((row) => [row.value, row]),
      ).values(),
    );
  }, [
    resource,
    remote.data,
    labelField,
    legacyRemote,
    legacy.data,
    options,
    term,
  ]);
  const busy =
    waiting ||
    (resource ? remote.isPending : legacyRemote ? legacy.isPending : loading);
  const failed =
    !waiting &&
    (resource ? remote.isError : legacyRemote ? legacy.isError : error);
  const items =
    busy || (!resource && failed)
      ? []
      : resource
        ? matches
        : matches.slice(0, limit);
  const hasMore =
    !busy &&
    !failed &&
    (resource ? remote.hasNextPage : matches.length > limit);

  const loadMore = useCallback(() => {
    if (!open || disabled || !hasMore || pending.current || remote.isFetching)
      return;
    if (resource) {
      const request = remote.fetchNextPage({ cancelRefetch: false });
      pending.current = request;
      void request.finally(() => {
        if (pending.current === request) pending.current = null;
      });
    } else {
      setWindow({ scope, size: limit + batchSize });
    }
  }, [
    open,
    disabled,
    hasMore,
    remote.isFetching,
    remote.fetchNextPage,
    resource,
    scope,
    limit,
    batchSize,
  ]);

  function retry() {
    if (resource) {
      if (remote.isFetchNextPageError)
        void remote.fetchNextPage({ cancelRefetch: false });
      else void remote.refetch();
    } else if (legacyRemote) void legacy.refetch();
    else onRetry?.();
  }

  return {
    items,
    busy,
    failed,
    hasMore,
    loadMore,
    retry,
    scope,
    loadingMore: Boolean(resource && !waiting && remote.isFetchingNextPage),
  };
}
