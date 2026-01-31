export type TokenMetadata = {
  decimals: number;
  logo?: string | null;
  name?: string | null;
  symbol?: string | null;
};

export function formatUnitsFromHex(hexValue: string, decimals: number) {
  // hexValue is a hex string quantity (e.g., 0x1a)
  const raw = BigInt(hexValue);
  if (decimals === 0) return raw.toString();
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = raw % base;

  // keep up to 6 decimals for UI
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, 6).replace(/0+$/, "");
  return fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
}
