const ISO_DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const BR_DATE_ONLY_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function isValidIsoDate(value: string): boolean {
  const match = value.match(ISO_DATE_ONLY_PATTERN);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

/** UI input is always day/month/year; API and calendar arithmetic stay date-only ISO. */
export function parseDateInput(value: string): string | null {
  const match = value.trim().match(BR_DATE_ONLY_PATTERN);
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  return isValidIsoDate(iso) ? iso : null;
}

export function formatDateInputText(value: string): string {
  if (!/^[\d/]*$/.test(value)) return value;
  const digits = value.replace(/\//g, "").slice(0, 8);
  let result = digits.slice(0, 2);
  if (digits.length > 2) result += "/" + digits.slice(2, 4);
  if (digits.length > 4) result += "/" + digits.slice(4);
  if (value.endsWith("/") && (digits.length === 2 || digits.length === 4))
    result += "/";
  return result;
}

export function hasValidDateFilters(filters: Record<string, unknown>): boolean {
  return ["from", "to", "start_date", "end_date", "startDate", "endDate"].every(
    (key) =>
      !filters[key] ||
      (typeof filters[key] === "string" &&
        isValidIsoDate(filters[key] as string)),
  );
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function parseDateOnly(
  match: RegExpMatchArray,
  order: "ymd" | "dmy",
): Date | null {
  const [a, b, c] = match.slice(1, 4).map(Number);
  const [year, month, day] = order === "ymd" ? [a, b, c] : [c, b, a];
  if (!isValidDateParts(year, month, day)) {
    return null;
  }
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseDateValue(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(ISO_DATE_ONLY_PATTERN);
  if (isoMatch) {
    return parseDateOnly(isoMatch, "ymd");
  }

  const brMatch = trimmed.match(BR_DATE_ONLY_PATTERN);
  if (brMatch) {
    return parseDateOnly(brMatch, "dmy");
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function formatIsoDate(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, "0")}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatDdMmYyyy(date: Date): string {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${String(date.getFullYear()).padStart(4, "0")}`;
}

export function formatDateDdMmYyyy(
  value: string | null | undefined,
  fallback = "-",
): string {
  if (!value) {
    return fallback;
  }

  const parsed = parseDateValue(value);
  if (!parsed) {
    return value;
  }
  return formatDdMmYyyy(parsed);
}

export function formatDateTimeDdMmYyyy(
  value: string | null | undefined,
  fallback = "-",
): string {
  if (!value) {
    return fallback;
  }

  const parsed = parseDateValue(value);
  if (!parsed) {
    return value;
  }
  if (
    ISO_DATE_ONLY_PATTERN.test(value.trim()) ||
    BR_DATE_ONLY_PATTERN.test(value.trim())
  ) {
    return formatDdMmYyyy(parsed);
  }
  return `${formatDdMmYyyy(parsed)} ${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`;
}

export function getTodayIsoDate(referenceDate = new Date()): string {
  return formatIsoDate(referenceDate);
}
