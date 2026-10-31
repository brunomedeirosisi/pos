import { vi } from "vitest";
import * as lists from "../services/lists";
import type { ListFilters, Page } from "../services/lists";

export function pageFixture<T>(
  items: T[],
  page = 1,
  pageSize = 25,
  totalItems = items.length,
): Page<T> {
  return {
    items,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    },
  };
}

/** Keep existing business-action fixtures while migrating their read contracts. */
export function mockListPages(
  load: (
    resource: string,
    input: ListFilters,
  ) => Promise<unknown[] | Page<unknown>>,
) {
  return vi
    .spyOn(lists, "listPage")
    .mockImplementation(
      async <T>(resource: string, input: ListFilters = {}) => {
        const result = await load(resource, input);
        return (
          Array.isArray(result)
            ? pageFixture(
                result,
                Number(input.page ?? 1),
                Number(input.pageSize ?? 25),
              )
            : result
        ) as Page<T>;
      },
    );
}
