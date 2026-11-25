import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { listPage } from "../../services/lists";
import {
  useSelectOptions,
  type SelectOption,
  type SelectOptionsSource,
} from "../../hooks/useSelectOptions";

export type { SelectOption } from "../../hooks/useSelectOptions";

type SearchableSelectProps = SelectOptionsSource & {
  id: string;
  disabled?: boolean;
  emptyLabel?: string;
} & (
    | {
        multiple?: false;
        value: string;
        onChange: (option: SelectOption) => void;
      }
    | {
        multiple: true;
        value: string[];
        onChange: (options: SelectOption[]) => void;
      }
  );

export function SearchableSelect(props: SearchableSelectProps): JSX.Element {
  const {
    id,
    value,
    options,
    disabled = false,
    resource,
    labelField = "name",
    emptyLabel,
    multiple,
  } = props;
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(false);
  const context = JSON.stringify([
    resource,
    props.filters,
    props.pageSize,
    props.optionsKey,
  ]);
  const [active, setActive] = useState({ context, term: "", index: -1 });
  const [known, setKnown] = useState(() => new Map<string, SelectOption>());
  const source = useSelectOptions({
    ...props,
    optionsKey: props.optionsKey ?? id,
    open,
    disabled,
    search,
  });
  const { items, busy, failed, hasMore, loadMore, loadingMore, scope } = source;
  const values = useMemo(
    () => (multiple ? value : value ? [value] : []),
    [multiple, value],
  );
  const selectedResults = useQueries({
    queries: values.map((selectedValue) => ({
      queryKey: ["select-value", resource, selectedValue],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        listPage<Record<string, string>>(
          resource!,
          { optionId: selectedValue, pageSize: 1 },
          signal,
        ),
      enabled: Boolean(
        resource &&
        !known.has(selectedValue) &&
        !options.some((option) => option.value === selectedValue),
      ),
      staleTime: 60_000,
      retry: false,
    })),
  });
  const selected = values.map(
    (selectedValue, index) =>
      options.find((option) => option.value === selectedValue) ??
      known.get(selectedValue) ??
      (selectedResults[index]?.data?.items[0]
        ? {
            value: selectedValue,
            label: selectedResults[index].data.items[0][labelField],
          }
        : (items.find((option) => option.value === selectedValue) ?? {
            value: selectedValue,
            label: selectedValue,
          })),
  );
  const choices =
    busy || (failed && !items.length)
      ? []
      : search.trim() || multiple
        ? items
        : [{ value: "", label: emptyLabel ?? t("common.none") }, ...items];
  const activeIndex =
    active.context === context && active.term === search.trim()
      ? Math.min(active.index, choices.length - 1)
      : -1;
  const activeId =
    open && !disabled && activeIndex >= 0
      ? `${id}-option-${activeIndex}`
      : undefined;

  useEffect(() => {
    if (activeId)
      document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeId]);

  useEffect(() => {
    const root = popup.current;
    const target = sentinel.current;
    if (
      !open ||
      disabled ||
      !hasMore ||
      !root ||
      !target ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { root, rootMargin: "0px 0px 80px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [open, disabled, hasMore, loadMore]);

  // Reset position only for a different search/source, never when appending options.
  useEffect(() => {
    if (popup.current) popup.current.scrollTop = 0;
  }, [scope, open]);

  function activate(index: number, term = search.trim()) {
    setActive({ context, term, index });
  }

  function close() {
    setOpen(false);
    setSearch("");
    setEditing(false);
    activate(-1, "");
  }

  function select(option: SelectOption) {
    setKnown((current) => {
      const next = new Map(current);
      for (const item of [...selected, option])
        if (item.value) next.set(item.value, item);
      return next;
    });
    if (props.multiple) {
      props.onChange(
        values.includes(option.value)
          ? selected.filter((item) => item.value !== option.value)
          : [...selected, option],
      );
    } else props.onChange(option);
    input.current?.focus();
    if (!props.multiple) close();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (event.key === "ArrowDown" && activeIndex === choices.length - 1)
        loadMore();
      activate(
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
          aria-busy={busy || loadingMore}
          value={
            editing ? search : selected.map((option) => option.label).join(", ")
          }
          placeholder={emptyLabel ?? t("common.searchSelectPlaceholder")}
          onFocus={(event) => {
            setOpen(true);
            event.target.select();
          }}
          onChange={(event) => {
            setSearch(event.target.value);
            setEditing(true);
            setOpen(true);
            activate(0, event.target.value.trim());
          }}
          onKeyDown={handleKeyDown}
        />
        <div className="searchable-select__actions">
          {values.length > 0 && (
            <button
              type="button"
              disabled={disabled}
              aria-label={t("common.clearSelection")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (props.multiple) {
                  props.onChange([]);
                  input.current?.focus();
                } else select({ value: "", label: t("common.none") });
              }}
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
        <div
          ref={popup}
          className="searchable-select__popup"
          onScroll={(event) => {
            const element = event.currentTarget;
            if (
              element.scrollHeight - element.scrollTop - element.clientHeight <=
              80
            )
              loadMore();
          }}
        >
          <ul
            id={`${id}-listbox`}
            role="listbox"
            aria-labelledby={`${id}-label`}
            aria-multiselectable={multiple || undefined}
            aria-busy={busy || loadingMore}
          >
            {choices.map((option, index) => (
              <li
                id={`${id}-option-${index}`}
                key={option.value}
                role="option"
                aria-selected={
                  values.includes(option.value) ||
                  (!multiple && option.value === value)
                }
                className={
                  index === activeIndex
                    ? "searchable-select__option is-active"
                    : "searchable-select__option"
                }
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => activate(index)}
                onClick={() => select(option)}
              >
                {option.label}
              </li>
            ))}
          </ul>
          {hasMore && (
            <div
              ref={sentinel}
              className="searchable-select__sentinel"
              aria-hidden="true"
            />
          )}
          <div role="status" aria-live="polite" aria-atomic="true">
            {busy ? (
              <p>{t("common.loading")}</p>
            ) : loadingMore ? (
              <p>{t("common.searchSelectLoadingMore")}</p>
            ) : !failed && items.length === 0 ? (
              <p>
                {t(
                  search.trim()
                    ? "common.searchSelectNoMatches"
                    : "common.searchSelectEmpty",
                )}
              </p>
            ) : null}
          </div>
          {!busy && failed && (
            <div role="alert">
              <p>{t("common.searchSelectLoadError")}</p>
              <button
                type="button"
                className="button secondary"
                onClick={source.retry}
              >
                {t("common.retry")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
