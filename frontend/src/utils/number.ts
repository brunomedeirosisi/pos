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

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrencyBrl(value: number): string {
  return brlFormatter.format(Number.isFinite(value) ? value : 0);
}

export function formatCurrencyInput(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return '';
  }

  return formatCurrencyBrl(value);
}

export function parseCurrencyInputToNumber(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return 0;
  }

  return Number(digits) / 100;
}
