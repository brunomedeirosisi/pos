export function parseLocaleNumericInput(value: unknown) {
  if (value === '' || value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  let normalized = trimmed.replace(/\s+/g, '');
  const commaPos = normalized.lastIndexOf(',');
  const dotPos = normalized.lastIndexOf('.');

  if (commaPos > -1 && dotPos > -1) {
    if (commaPos > dotPos) {
      normalized = normalized.replace(/\./g, '');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  }

  normalized = normalized.replace(',', '.').replace(/[^0-9.+-]/g, '');

  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? value : parsed;
}
