export const SPORTFUN_NAME_OVERRIDES: Record<string, string> = {
  // Format: "<contractAddressLower>:<tokenIdDec>" or "<tokenIdDec>" for fallback.
  // Example:
  // "0xabc...:12345": "John Doe",
};

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
