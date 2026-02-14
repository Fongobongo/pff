import rawSportfunNameOverrides from "@/lib/sportfunNameOverrides.json";

function normalizeTokenIdDec(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^-?\d+$/.test(trimmed)) return trimmed;
  try {
    return BigInt(trimmed).toString(10);
  } catch {
    return trimmed;
  }
}

function normalizeOverrideKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "";
  const sep = trimmed.indexOf(":");
  if (sep === -1) {
    return normalizeTokenIdDec(trimmed);
  }
  const contractAddress = trimmed.slice(0, sep).trim().toLowerCase();
  const tokenIdDec = normalizeTokenIdDec(trimmed.slice(sep + 1));
  if (!contractAddress || !tokenIdDec) return "";
  return `${contractAddress}:${tokenIdDec}`;
}

function buildJsonOverrideMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    const key = normalizeOverrideKey(rawKey);
    if (!key) continue;
    if (typeof rawValue !== "string") continue;
    const value = rawValue.trim();
    if (!value) continue;
    out[key] = value;
  }
  return out;
}

// `src/lib/sportfunNameOverrides.json` format:
// {
//   "<contractAddressLower>:<tokenIdDec>": "Player Name",
//   "<tokenIdDec>": "Fallback Name"
// }
const SPORTFUN_NAME_OVERRIDES_JSON = buildJsonOverrideMap(rawSportfunNameOverrides);

export const SPORTFUN_NAME_OVERRIDES: Record<string, string> = {
  ...SPORTFUN_NAME_OVERRIDES_JSON,
};

export type SportfunSport = "soccer" | "nfl" | "unknown";

export const SPORTFUN_CONTRACT_SPORT: Record<string, SportfunSport> = {
  // Update if these are swapped.
  "0x71c8b0c5148edb0399d1edf9bf0c8c81dea16918": "soccer",
  "0x2eef466e802ab2835ab81be63eebc55167d35b56": "nfl",
};

export function getSportfunSportLabel(contractAddress?: string): SportfunSport {
  if (!contractAddress) return "unknown";
  return SPORTFUN_CONTRACT_SPORT[contractAddress.toLowerCase()] ?? "unknown";
}

export function getSportfunNameOverride(
  contractAddress?: string,
  tokenIdDec?: string
): string | undefined {
  if (!tokenIdDec) return undefined;
  const direct = contractAddress
    ? SPORTFUN_NAME_OVERRIDES[`${contractAddress.toLowerCase()}:${tokenIdDec}`]
    : undefined;
  return direct ?? SPORTFUN_NAME_OVERRIDES[tokenIdDec];
}
