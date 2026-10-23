export const PAYMENT_REPORT_ROW_LIMIT = 5000;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cents(value: unknown): bigint | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) return null;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
}

/** Counts, unique identities and exact decimal sums must agree before printing. */
export function isCompletePaymentReport(value: unknown): boolean {
  if (!record(value)) return false;
  const { payments, summary, coverage } = value;
  if (!Array.isArray(payments) || payments.length > PAYMENT_REPORT_ROW_LIMIT || !record(summary))
    return false;
  if (!Number.isSafeInteger(summary.filtered_count) || summary.filtered_count !== payments.length)
    return false;
  if (
    coverage !== undefined &&
    (!record(coverage) || coverage.complete !== true || coverage.row_count !== payments.length)
  )
    return false;
  const ids = new Set<string>();
  let sum = 0n;
  for (const payment of payments) {
    if (!record(payment) || typeof payment.id !== 'string' || !payment.id || ids.has(payment.id))
      return false;
    ids.add(payment.id);
    const amount = cents(payment.amount);
    if (amount === null || amount <= 0n) return false;
    sum += amount;
  }
  const total = cents(summary.filtered_total_paid);
  return total !== null && sum === total;
}
