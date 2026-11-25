export const chartPalette = [
  "#1d4ed8",
  "#16a34a",
  "#ea580c",
  "#8b5cf6",
  "#0ea5e9",
  "#f59e0b",
  "#ef4444",
  "#22c55e",
];
export function renderLinePoints(
  values: number[],
  width: number,
  height: number,
  padding: number,
  bounds?: { min: number; max: number },
): string {
  if (values.length <= 1) return `${width / 2},${height / 2}`;
  const max = bounds?.max ?? Math.max(...values, 1),
    min = bounds?.min ?? Math.min(...values, 0),
    range = Math.max(max - min, 1);
  return values
    .map(
      (value, index) =>
        `${padding + (index / (values.length - 1)) * (width - padding * 2)},${height - padding - ((value - min) / range) * (height - padding * 2)}`,
    )
    .join(" ");
}
export function getHeatColor(value: number, max: number): string {
  if (max <= 0 || value <= 0) return "rgba(148, 163, 184, 0.15)";
  return `rgba(29, 78, 216, ${Math.min(0.95, Math.max(0.12, value / max))})`;
}
