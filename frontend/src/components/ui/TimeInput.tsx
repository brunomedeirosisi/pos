import React, { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";

export const isValidTime = (value: string) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
type Props = {
  id?: string;
  value: string;
  onValueChange(value: string): void;
  disabled?: boolean;
  required?: boolean;
};

/** Fixed HH:mm in every browser language, sharing the existing date-input shell. */
export function TimeInput({
  id: suppliedId,
  value,
  onValueChange,
  disabled,
  required,
}: Props): JSX.Element {
  const generatedId = useId(),
    id = suppliedId ?? generatedId;
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState("03"),
    [minute, setMinute] = useState("00");
  return (
    <div className="date-input">
      <div className="date-input__control">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="HH:mm"
          maxLength={5}
          pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
          value={value}
          required={required}
          disabled={disabled}
          aria-invalid={Boolean(value && !isValidTime(value))}
          aria-describedby={id + "-help"}
          onChange={(event) => {
            const raw = event.target.value.replace(/[^0-9:]/g, "");
            const text = raw.includes(":")
              ? raw
              : raw.length > 2
                ? raw.slice(0, 2) + ":" + raw.slice(2, 4)
                : raw;
            onValueChange(text.slice(0, 5));
          }}
        />
        <button
          type="button"
          className="date-input__toggle"
          disabled={disabled}
          aria-label={t("timeInput.openPicker")}
          aria-haspopup="dialog"
          aria-expanded={open && !disabled}
          onClick={() => {
            const [h, m] = (isValidTime(value) ? value : "03:00").split(":");
            setHour(h);
            setMinute(m);
            setOpen(true);
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 6v6l4 2" />
          </svg>
        </button>
      </div>
      <small id={id + "-help"} className="text-muted">
        {t("timeInput.format")}
      </small>
      <Modal
        open={open && !disabled}
        onClose={() => setOpen(false)}
        title={t("timeInput.title")}
        width="320px"
      >
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor={id + "-hour"}>{t("timeInput.hour")}</label>
            <select
              id={id + "-hour"}
              value={hour}
              onChange={(e) => setHour(e.target.value)}
            >
              {Array.from({ length: 24 }, (_, i) =>
                String(i).padStart(2, "0"),
              ).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor={id + "-minute"}>{t("timeInput.minute")}</label>
            <select
              id={id + "-minute"}
              value={minute}
              onChange={(e) => setMinute(e.target.value)}
            >
              {Array.from({ length: 60 }, (_, i) =>
                String(i).padStart(2, "0"),
              ).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => setOpen(false)}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              onValueChange(hour + ":" + minute);
              setOpen(false);
            }}
          >
            {t("common.apply")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
