export const SPORTFUN_NAME_OVERRIDES: Record<string, string> = {
  // Format: "<contractAddressLower>:<tokenIdDec>" or "<tokenIdDec>" for fallback.
  // Example:
  // "0xabc...:12345": "John Doe",
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
