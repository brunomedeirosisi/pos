const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

export function durationSeconds(value: string): number | null {
  const match = /^([1-9]\d*)(s|m|h|d)$/.exec(value);
  if (!match) return null;
  const seconds = Number(match[1]) * units[match[2]];
  return Number.isSafeInteger(seconds) && seconds <= 30 * 86400 ? seconds : null;
}
