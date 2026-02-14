const BASE_URL = "https://api.tenero.io";
const SAMPLE_WALLET = "0x82c117A68fD47A2d53b997049F4BE44714D57455";

type JsonObject = Record<string, unknown>;

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`${url} -> ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }
  return body ? JSON.parse(body) : null;
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function asObject(value: unknown, path: string): JsonObject {
  assert(value && typeof value === "object" && !Array.isArray(value), `${path} is not an object`);
  return value as JsonObject;
}

function checkEnvelope(payload: unknown, endpoint: string): JsonObject {
  const root = asObject(payload, `${endpoint} root`);
  assert(root.statusCode === 200, `${endpoint} statusCode expected 200`);
  assert(typeof root.message === "string", `${endpoint} message missing`);
  assert("data" in root, `${endpoint} data missing`);
  return root;
}

async function main() {
  const checks: Array<() => Promise<void>> = [
    async () => {
      const payload = await fetchJson(`${BASE_URL}/v1/sportsfun/tokens?limit=1`);
      const root = checkEnvelope(payload, "tokens");
      const data = asObject(root.data, "tokens.data");
      assert(Array.isArray(data.rows), "tokens.data.rows missing");
    },
    async () => {
      const payload = await fetchJson(`${BASE_URL}/v1/sportsfun/pools?limit=1`);
      const root = checkEnvelope(payload, "pools");
      const data = asObject(root.data, "pools.data");
      assert(Array.isArray(data.rows), "pools.data.rows missing");
    },
    async () => {
      const payload = await fetchJson(`${BASE_URL}/v1/sportsfun/market/top_gainers?timeframe=1d`);
      const root = checkEnvelope(payload, "market.top_gainers");
      assert(Array.isArray(root.data), "market.top_gainers data should be array");
    },
    async () => {
      const payload = await fetchJson(`${BASE_URL}/v1/sportsfun/wallets/${SAMPLE_WALLET}/trades?limit=1`);
      const root = checkEnvelope(payload, "wallet.trades");
      const data = asObject(root.data, "wallet.trades.data");
      assert(Array.isArray(data.rows), "wallet.trades.data.rows missing");
    },
    async () => {
      const payload = await fetchJson(`${BASE_URL}/v1/sportsfun/wallets/${SAMPLE_WALLET}/transfers?limit=1`);
      const root = checkEnvelope(payload, "wallet.transfers");
      const data = asObject(root.data, "wallet.transfers.data");
      assert(Array.isArray(data.rows), "wallet.transfers.data.rows missing");
    },
  ];

  for (const check of checks) {
    await check();
  }

  console.log("sportsfun contract checks passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
