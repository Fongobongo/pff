export function shortenAddress(address: string) {
  const a = address.trim();
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function hexToBigInt(hex: string) {
  return BigInt(hex);
}

export function formatEthFromWeiHex(weiHex: string) {
  const wei = hexToBigInt(weiHex);
  const eth = Number(wei) / 1e18;
  return eth.toLocaleString(undefined, { maximumFractionDigits: 6 });
}
