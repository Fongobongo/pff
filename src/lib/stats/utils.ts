export function toFiniteNumber(value: unknown): number {
  if (typeof value !== "number") return 0;
  if (!Number.isFinite(value)) return 0;
  return value;
}

export function roundToDecimals(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** Math.max(0, decimals);
  return Math.round(value * factor) / factor;
}
