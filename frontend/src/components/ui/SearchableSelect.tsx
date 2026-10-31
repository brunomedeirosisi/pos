import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { listPage, type ListFilters } from "../../services/lists";
import { Pagination } from "./Pagination";

export type SelectOption = { value: string; label: string };

type SearchableSelectProps = {
  id: string;
  value: string;
  options: SelectOption[];
  onChange: (option: SelectOption) => void;
  optionsKey?: string;
  loadOptions?: (search: string) => Promise<SelectOption[]>;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  disabled?: boolean;
  resource?: string;
  labelField?: string;
  filters?: ListFilters;
  emptyLabel?: string;
};

export function SearchableSelect({
  id,
  value,
  options,
  onChange,
  optionsKey = id,
  loadOptions,
  loading = false,
  error = false,
  onRetry,
  disabled = false,
  resource,
  labelField = "name",
  filters,
  emptyLabel,
}: SearchableSelectProps): JSX.Element {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState(-1);
  const [lastSelection, setLastSelection] = useState<SelectOption | null>(null);
  const [pageState, setPageState] = useState({
    page: 1,
    pageSize: 10,
    term: "",
  });
  const term = search.trim();
  const debounced = useDebouncedValue(term, 300);
  const remote = Boolean(resource || (term && loadOptions));
  const optionPage = pageState.term === debounced ? pageState.page : 1;
  const pageResults = useQuery({
    queryKey: [
      "select-page",
      resource,
      filters,
      debounced,
      optionPage,
      pageState.pageSize,
    ],
    queryFn: () =>
      listPage<Record<string, string>>(resource!, {
        ...filters,
        search: debounced || undefined,
        page: optionPage,
        pageSize: pageState.pageSize,
      }),
    enabled: open && Boolean(resource) && term === debounced && !disabled,
    staleTime: 30_000,
    retry: false,
  });
  const selectedResult = useQuery({
    queryKey: ["select-value", resource, value],
    queryFn: () =>
      listPage<Record<string, string>>(resource!, {
        optionId: value,
        pageSize: 1,
      }),
    enabled: Boolean(
      resource &&
      value &&
      lastSelection?.value !== value &&
      !options.some((option) => option.value === value),
    ),
    staleTime: 60_000,
    retry: false,
  });
  const results = useQuery({
    queryKey: ["history-filter-options", optionsKey, debounced],
    queryFn: () => (loadOptions ? loadOptions(debounced) : Promise.resolve([])),
    enabled:
      open &&
      !resource &&
      Boolean(loadOptions && term && term === debounced) &&
      !disabled,
    staleTime: 60_000,
    retry: false,
  });
  const busy = resource
    ? term !== debounced || pageResults.isFetching
    : remote
      ? term !== debounced || results.isFetching
      : loading;
  const failed = resource
    ? pageResults.isError
    : remote
      ? term === debounced && results.isError
      : error;
  const matches = resource
    ? (pageResults.data?.items ?? []).map((row) => ({
        value: row.id,
        label: row[labelField],
      }))
    : remote
      ? (results.data ?? [])
      : options.filter((option) =>
          option.label.toLocaleLowerCase().includes(term.toLocaleLowerCase()),
        );
  const choices =
    busy || failed
      ? []
      : term
        ? matches
        : [{ value: "", label: emptyLabel ?? t("common.none") }, ...matches];
  const activeIndex = Math.min(active, choices.length - 1);
  const activeId =
    open && !disabled && activeIndex >= 0
      ? `${id}-option-${activeIndex}`
      : undefined;
  const selected = value
    ? (options.find((option) => option.value === value) ??
      (lastSelection?.value === value ? lastSelection : null) ??
      (selectedResult.data?.items[0]
        ? { value, label: selectedResult.data.items[0][labelField] }
        : null))
    : null;

  useEffect(() => {
    if (activeId)
      document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeId]);

  function close() {
    setOpen(false);
    setSearch("");
    setEditing(false);
    setActive(-1);
  }

  function select(option: SelectOption) {
    setLastSelection(option);
    onChange(option);
    input.current?.focus();
    close();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive(
        event.key === "ArrowDown"
          ? Math.min(activeIndex + 1, choices.length - 1)
          : Math.max(activeIndex - 1, 0),
      );
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      if (activeIndex >= 0) select(choices[activeIndex]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }

  return (
    <div
      className="searchable-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
    >
      <div className="searchable-select__control">
        <input
          ref={input}
          id={id}
          role="combobox"
          type="text"
          autoComplete="off"
          disabled={disabled}
          aria-autocomplete="list"
          aria-expanded={open && !disabled}
          aria-controls={open && !disabled ? `${id}-listbox` : undefined}
          aria-activedescendant={activeId}
          aria-describedby={`${id}-help`}
          aria-busy={busy}
          value={editing ? search : (selected?.label ?? "")}
          placeholder={emptyLabel ?? t("common.searchSelectPlaceholder")}
          onFocus={(event) => {
            setOpen(true);
            event.target.select();
          }}
          onChange={(event) => {
            setSearch(event.target.value);
            setEditing(true);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={handleKeyDown}
        />
        <div className="searchable-select__actions">
          {value && (
            <button
              type="button"
              disabled={disabled}
              aria-label={t("common.clearSelection")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select({ value: "", label: t("common.none") })}
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            tabIndex={-1}
            aria-label={t("common.showOptions")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (open) close();
              else {
                setOpen(true);
                input.current?.focus();
              }
            }}
          >
            <span aria-hidden="true">▾</span>
          </button>
        </div>
      </div>
      <span className="sr-only" id={`${id}-help`}>
        {t("common.searchSelectHelp")}
      </span>
      {open && !disabled && (
        <div className="searchable-select__popup">
          <ul
            id={`${id}-listbox`}
            role="listbox"
            aria-labelledby={`${id}-label`}
          >
            {choices.map((option, index) => (
              <li
                id={`${id}-option-${index}`}
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                className={
                  index === activeIndex
                    ? "searchable-select__option is-active"
                    : "searchable-select__option"
                }
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => select(option)}
              >
                {option.label}
              </li>
            ))}
          </ul>
          {busy && <p role="status">{t("common.loading")}</p>}
          {!busy && failed && (
            <div role="alert">
              <p>{t("common.searchSelectLoadError")}</p>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  if (resource) {
                    void pageResults.refetch();
                  } else if (remote) {
                    void results.refetch();
                  } else onRetry?.();
                }}
              >
                {t("common.retry")}
              </button>
            </div>
          )}
          {!busy && !failed && choices.length === 0 && (
            <p role="status">{t("common.searchSelectNoMatches")}</p>
          )}
          {resource && pageResults.data && !failed && (
            <Pagination
              pagination={pageResults.data.pagination}
              disabled={busy}
              label={t("common.showOptions")}
              onPageChange={(page) => {
                setPageState((current) => ({
                  ...current,
                  page,
                  term: debounced,
                }));
                setActive(-1);
              }}
              onPageSizeChange={(pageSize) => {
                setPageState({ page: 1, pageSize, term: debounced });
                setActive(-1);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
