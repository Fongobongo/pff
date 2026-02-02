import { env } from "@/lib/env";

export function getAlchemyBaseRpcUrl(): string {
  // Prefer explicit BASE_RPC_URL if it already points to Alchemy.
  if (env.BASE_RPC_URL && env.BASE_RPC_URL.includes("alchemy.com")) return env.BASE_RPC_URL;

  const key = env.ALCHEMY_API_KEY;
  if (!key) {
    throw new Error(
      "ALCHEMY_API_KEY is not set. Add it (or ALEMBIC_API_KEY) to .env(.local) to enable wallet history endpoints."
    );
  }

  return `https://base-mainnet.g.alchemy.com/v2/${key}`;
}

export async function alchemyRpc(method: string, params: unknown[]) {
  const url = getAlchemyBaseRpcUrl();

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
    // Cache briefly to reduce rate-limit pressure.
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    throw new Error(`Alchemy RPC request failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (data?.error) {
    throw new Error(`Alchemy RPC error: ${data.error.code} ${data.error.message}`);
  }

  return data.result;
}
