import { env } from "@/lib/env";

export type EtherscanV2Params = Record<string, string | number | boolean | undefined>;

export function getEtherscanApiKey(): string {
  const key = env.ETHERSCAN_API_KEY;
  if (!key) {
    throw new Error(
      "ETHERSCAN_API_KEY is not set. Add it to .env.local to enable explorer-backed history endpoints."
    );
  }
  return key;
}

export async function etherscanV2(params: EtherscanV2Params) {
  const apiKey = getEtherscanApiKey();

  const url = new URL("https://api.etherscan.io/v2/api");
  url.searchParams.set("apikey", apiKey);

  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    // Etherscan caches aggressively; allow Next.js to cache as well for stability on free-tier rate limits.
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    throw new Error(`Etherscan v2 request failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
}
