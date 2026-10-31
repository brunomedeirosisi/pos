import { useListState, type ListControls } from "./useListQuery";

/** Only for bounded collections already needed in full (cart, detail and chart data). */
export function useClientPage<T>(
  key: string,
  items: readonly T[],
  filters: unknown = "",
) {
  const signature = JSON.stringify(filters);
  const [state, setState] = useListState(`client-${key}`, {
    page: 1,
    pageSize: 25,
    signature,
  });
  const totalPages = Math.max(1, Math.ceil(items.length / state.pageSize));
  const page =
    state.signature === signature ? Math.min(state.page, totalPages) : 1;
  const controls: ListControls = {
    pagination: {
      page,
      pageSize: state.pageSize,
      totalItems: items.length,
      totalPages,
    },
    isFetching: false,
    isError: false,
    refetch: () => undefined,
    setPage: (next) =>
      setState((current) => ({ ...current, page: next, signature })),
    setPageSize: (pageSize) => setState({ page: 1, pageSize, signature }),
  };
  return {
    items: items.slice((page - 1) * state.pageSize, page * state.pageSize),
    controls,
  };
}
