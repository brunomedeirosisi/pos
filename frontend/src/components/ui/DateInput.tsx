import React, { forwardRef, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  formatDateDdMmYyyy,
  getTodayIsoDate,
  isValidIsoDate,
  parseDateInput,
  formatDateInputText,
} from "../../utils/date";
import { Modal } from "./Modal";

type Props = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "min" | "max"
> & {
  value: string;
  onValueChange: (value: string) => void;
  min?: string;
  max?: string;
};
const isoDay = (year: number, month: number, day: number) =>
  `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
function dateObject(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}
function moveDay(iso: string, days: number) {
  const date = dateObject(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDay(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Locale-independent display, with one shared calendar and ISO values for existing consumers. */
export const DateInput = forwardRef<HTMLInputElement, Props>(function DateInput(
  {
    value,
    onValueChange,
    min = "0001-01-01",
    max = "9999-12-31",
    disabled,
    readOnly,
    required,
    id: suppliedId,
    ...inputProps
  },
  forwardedRef,
) {
  const { t, i18n } = useTranslation();
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const input = useRef<HTMLInputElement | null>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const focusDay = useRef(false);
  const clamp = (day: string) => (day < min ? min : day > max ? max : day);
  const seed = clamp(isValidIsoDate(value) ? value : getTodayIsoDate());
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(seed);
  const [month, setMonth] = useState(seed.slice(0, 7));
  const [year, monthNumber] = month.split("-").map(Number);
  const monthIndex = monthNumber - 1;
  const first = dateObject(`${month}-01`);
  const offset = (first.getUTCDay() + 6) % 7;
  const last = dateObject(`${month}-01`);
  last.setUTCMonth(monthNumber, 0);
  const count = last.getUTCDate();
  const valid = isValidIsoDate(value);
  const error =
    value && !valid
      ? t("dateInput.invalid")
      : value && value < min
        ? t("dateInput.min", { date: formatDateDdMmYyyy(min) })
        : value && value > max
          ? t("dateInput.max", { date: formatDateDdMmYyyy(max) })
          : "";
  const externalError =
    inputProps["aria-invalid"] && inputProps["aria-describedby"];
  const helpId = `${id}-format`,
    errorId = `${id}-invalid`;
  const describedBy = [
    inputProps["aria-describedby"],
    helpId,
    error && !externalError ? errorId : "",
  ]
    .filter(Boolean)
    .join(" ");
  const months = Array.from({ length: 12 }, (_, index) =>
    new Intl.DateTimeFormat(i18n.language, {
      month: "long",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2000, index, 1))),
  );
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: "short",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2024, 0, index + 1))),
  );

  useEffect(() => {
    input.current?.setCustomValidity(error);
  }, [error]);
  useEffect(() => {
    if (open && focusDay.current) {
      focusDay.current = false;
      calendar.current
        ?.querySelector<HTMLButtonElement>(
          `button[data-date="${active}"]:not([disabled])`,
        )
        ?.focus();
    }
  }, [open, active]);
  useEffect(() => {
    if (disabled || readOnly) setOpen(false);
  }, [disabled, readOnly]);

  function showCalendar() {
    const next = clamp(isValidIsoDate(value) ? value : getTodayIsoDate());
    setActive(next);
    setMonth(next.slice(0, 7));
    focusDay.current = true;
    setOpen(true);
  }
  function changeMonth(nextYear: number, nextMonth: number) {
    if (nextYear < 1 || nextYear > 9999) return;
    const date = dateObject(isoDay(nextYear, nextMonth, 1));
    const next = clamp(isoDay(date.getUTCFullYear(), date.getUTCMonth(), 1));
    setMonth(next.slice(0, 7));
    setActive(next);
  }
  function choose(day: string) {
    onValueChange(day);
    setOpen(false);
  }
  function calendarKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
      return;
    }
    const day = (event.target as HTMLElement).dataset.date;
    if (!day) return;
    const weekday = (dateObject(day).getUTCDay() + 6) % 7;
    const shifts: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -weekday,
      End: 6 - weekday,
    };
    if (!(event.key in shifts)) return;
    event.preventDefault();
    const next = clamp(moveDay(day, shifts[event.key]));
    focusDay.current = true;
    setActive(next);
    setMonth(next.slice(0, 7));
  }

  return (
    <div className="date-input">
      <div className="date-input__control">
        <input
          {...inputProps}
          id={id}
          ref={(node) => {
            input.current = node;
            if (typeof forwardedRef === "function") forwardedRef(node);
            else if (forwardedRef) forwardedRef.current = node;
          }}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          placeholder="DD/MM/YYYY"
          pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
          value={valid ? formatDateDdMmYyyy(value) : value}
          min={min}
          max={max}
          required={required}
          disabled={disabled}
          readOnly={readOnly}
          aria-invalid={inputProps["aria-invalid"] || Boolean(error)}
          aria-describedby={describedBy}
          onChange={(event) => {
            const text = formatDateInputText(event.target.value);
            onValueChange(parseDateInput(text) ?? text);
          }}
        />
        <button
          type="button"
          className="date-input__toggle"
          aria-label={t("dateInput.openCalendar")}
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={disabled || readOnly}
          onClick={showCalendar}
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 11h18" />
          </svg>
        </button>
      </div>
      <span className="sr-only" id={helpId}>
        {t("dateInput.format")}
      </span>
      {error && !externalError && (
        <small id={errorId} className="date-input__error" role="alert">
          {error}
        </small>
      )}
      <Modal
        open={open}
        title={t("dateInput.chooseDate")}
        width="360px"
        onClose={() => setOpen(false)}
      >
        <div
          className="date-input__calendar"
          ref={calendar}
          onKeyDown={calendarKey}
        >
          <div className="date-input__month">
            <button
              type="button"
              className="button secondary"
              aria-label={t("dateInput.previousMonth")}
              disabled={month <= min.slice(0, 7)}
              onClick={() => changeMonth(year, monthIndex - 1)}
            >
              ‹
            </button>
            <label className="sr-only" htmlFor={`${id}-month`}>
              {t("dateInput.month")}
            </label>
            <select
              id={`${id}-month`}
              value={monthIndex}
              onChange={(event) =>
                changeMonth(year, Number(event.target.value))
              }
            >
              {months.map((name, index) => (
                <option key={index} value={index}>
                  {name}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor={`${id}-year`}>
              {t("dateInput.year")}
            </label>
            <input
              id={`${id}-year`}
              type="number"
              min={1}
              max={9999}
              value={year}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isInteger(next)) changeMonth(next, monthIndex);
              }}
            />
            <button
              type="button"
              className="button secondary"
              aria-label={t("dateInput.nextMonth")}
              disabled={month >= max.slice(0, 7)}
              onClick={() => changeMonth(year, monthIndex + 1)}
            >
              ›
            </button>
          </div>
          <div
            className="date-input__days"
            role="grid"
            aria-label={`${months[monthIndex]} ${year}`}
          >
            <div role="row">
              {weekdays.map((day, index) => (
                <span role="columnheader" key={index}>
                  {day}
                </span>
              ))}
            </div>
            {Array.from({ length: 6 }, (_, week) => (
              <div role="row" key={week}>
                {Array.from({ length: 7 }, (_, column) => {
                  const day = week * 7 + column - offset + 1;
                  if (day < 1 || day > count)
                    return <span role="gridcell" key={column} />;
                  const iso = isoDay(year, monthIndex, day);
                  return (
                    <span
                      role="gridcell"
                      key={column}
                      aria-selected={iso === value}
                    >
                      <button
                        type="button"
                        data-date={iso}
                        tabIndex={iso === active ? 0 : -1}
                        disabled={iso < min || iso > max}
                        aria-label={formatDateDdMmYyyy(iso)}
                        aria-current={
                          iso === getTodayIsoDate() ? "date" : undefined
                        }
                        onClick={() => choose(iso)}
                      >
                        {day}
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="form-actions">
            {!required && (
              <button
                type="button"
                className="button secondary"
                onClick={() => choose("")}
              >
                {t("dateInput.clear")}
              </button>
            )}
            <button
              type="button"
              className="button secondary"
              onClick={() => setOpen(false)}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
});
