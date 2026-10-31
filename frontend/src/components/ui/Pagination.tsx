import React, { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PaginationMeta } from "../../services/lists";
import type { ListControls } from "../../hooks/useListQuery";

type Props = {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizes?: readonly number[];
  disabled?: boolean;
  label?: string;
};
export function Pagination({
  pagination: meta,
  onPageChange,
  onPageSizeChange,
  pageSizes = [10, 25, 50, 100],
  disabled = false,
  label,
}: Props): JSX.Element {
  const { t } = useTranslation();
  const id = useId();
  const [jump, setJump] = useState(String(meta.page));
  useEffect(() => setJump(String(meta.page)), [meta.page]);
  const valid =
    /^\d+$/.test(jump) && Number(jump) >= 1 && Number(jump) <= meta.totalPages;
  const start = meta.totalItems ? (meta.page - 1) * meta.pageSize + 1 : 0;
  const end = Math.min(meta.page * meta.pageSize, meta.totalItems);
  return (
    <nav
      className="pagination"
      aria-label={label ?? t("pagination.navigation")}
      aria-busy={disabled}
    >
      <div className="pagination__summary" role="status" aria-live="polite">
        <span>
          {t("pagination.range", { start, end, total: meta.totalItems })}
        </span>
        <span>
          {t("pagination.page", { page: meta.page, total: meta.totalPages })}
        </span>
      </div>
      <div className="pagination__controls">
        <label htmlFor={`${id}-size`}>{t("pagination.pageSize")}</label>
        <select
          id={`${id}-size`}
          value={meta.pageSize}
          disabled={disabled}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {[...new Set([...pageSizes, meta.pageSize])]
            .sort((a, b) => a - b)
            .map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
        </select>
        <button
          type="button"
          className="button secondary"
          aria-label={t("pagination.first")}
          disabled={disabled || meta.page <= 1}
          onClick={() => onPageChange(1)}
        >
          «
        </button>
        <button
          type="button"
          className="button secondary"
          aria-label={t("pagination.previous")}
          disabled={disabled || meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
        >
          ‹
        </button>
        <label className="sr-only" htmlFor={`${id}-jump`}>
          {t("pagination.goTo")}
        </label>
        <input
          id={`${id}-jump`}
          type="number"
          inputMode="numeric"
          min={1}
          max={meta.totalPages}
          value={jump}
          disabled={disabled}
          aria-invalid={!valid}
          onChange={(event) => setJump(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (valid) onPageChange(Number(jump));
            }
          }}
        />
        <button
          type="button"
          className="button secondary"
          disabled={disabled || !valid}
          onClick={() => onPageChange(Number(jump))}
        >
          {t("pagination.go")}
        </button>
        <button
          type="button"
          className="button secondary"
          aria-label={t("pagination.next")}
          disabled={disabled || meta.page >= meta.totalPages}
          onClick={() => onPageChange(meta.page + 1)}
        >
          ›
        </button>
        <button
          type="button"
          className="button secondary"
          aria-label={t("pagination.last")}
          disabled={disabled || meta.page >= meta.totalPages}
          onClick={() => onPageChange(meta.totalPages)}
        >
          »
        </button>
      </div>
    </nav>
  );
}

export function ListPagination({
  query,
  label,
}: {
  query: ListControls;
  label?: string;
}): JSX.Element | null {
  const { t } = useTranslation();
  if (query.enabled === false) return null;
  if (query.isError)
    return (
      <div className="pagination" role="alert">
        <span>{t("common.error")}</span>
        <button
          type="button"
          className="button secondary"
          disabled={query.isFetching}
          onClick={() => {
            void query.refetch();
          }}
        >
          {t("common.retry")}
        </button>
      </div>
    );
  if (!query.pagination) return <p role="status">{t("common.loading")}</p>;
  return (
    <Pagination
      pagination={query.pagination}
      onPageChange={query.setPage}
      onPageSizeChange={query.setPageSize}
      disabled={query.isFetching}
      label={label}
    />
  );
}
