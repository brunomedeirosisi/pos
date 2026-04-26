const ISO_DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const BR_DATE_ONLY_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function parseDateOnly(match: RegExpMatchArray, order: 'ymd' | 'dmy'): Date | null {
  const [a, b, c] = match.slice(1, 4).map(Number);
  const [year, month, day] = order === 'ymd' ? [a, b, c] : [c, b, a];
  if (!isValidDateParts(year, month, day)) {
    return null;
  }
  return new Date(year, month - 1, day);
}

function parseDateValue(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(ISO_DATE_ONLY_PATTERN);
  if (isoMatch) {
    return parseDateOnly(isoMatch, 'ymd');
  }

  const brMatch = trimmed.match(BR_DATE_ONLY_PATTERN);
  if (brMatch) {
    return parseDateOnly(brMatch, 'dmy');
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function formatIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatDdMmYyyy(date: Date): string {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatDateDdMmYyyy(value: string | null | undefined, fallback = '-'): string {
  if (!value) {
    return fallback;
  }

  const parsed = parseDateValue(value);
  if (!parsed) {
    return value;
  }
  return formatDdMmYyyy(parsed);
}

export function formatDateTimeDdMmYyyy(value: string | null | undefined, fallback = '-'): string {
  if (!value) {
    return fallback;
  }

  const parsed = parseDateValue(value);
  if (!parsed) {
    return value;
  }
  return `${formatDdMmYyyy(parsed)} ${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`;
}

export function getTodayIsoDate(referenceDate = new Date()): string {
  return formatIsoDate(referenceDate);
}
