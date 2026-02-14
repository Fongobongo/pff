import { env } from "@/lib/env";

const ALCHEMY_RETRY_MAX_ATTEMPTS = 4;
const ALCHEMY_RETRY_BASE_MS = 300;

export function getAlchemyBaseRpcUrl(): string {
  // Prefer explicit BASE_RPC_URL if it already points to Alchemy.
  if (env.BASE_RPC_URL && env.BASE_RPC_URL.includes("alchemy.com")) return env.BASE_RPC_URL;

  const key = env.ALCHEMY_API_KEY;
  if (!key) {
    throw new Error(
      "ALCHEMY_API_KEY is not set. Add it to .env(.local) to enable wallet history endpoints."
    );
  }

  return `https://base-mainnet.g.alchemy.com/v2/${key}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRpcDetail(raw: string): string {
  let detail = raw.trim();
  if (!detail) return "";
  try {
    const parsed = JSON.parse(detail) as { error?: { code?: number; message?: string } };
    if (parsed?.error?.message) {
      detail = parsed.error.message;
      if (typeof parsed.error.code === "number") {
        detail = `${parsed.error.code} ${detail}`;
      }
    }
  } catch {
    // Keep raw payload if JSON parsing fails.
  }
  if (detail.length > 500) detail = `${detail.slice(0, 500)}...`;
  return detail;
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isRetryableRpcMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("too many requests") ||
    normalized.includes("rate limit") ||
    normalized.includes("throughput") ||
    normalized.includes("compute units per second")
  );
}

function parseRetryAfterMs(retryAfterHeader: string | null): number | null {
  if (!retryAfterHeader) return null;
  const seconds = Number(retryAfterHeader);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.floor(seconds * 1000);
  return null;
}

function computeRetryDelayMs(attempt: number, retryAfterMs: number | null): number {
  if (retryAfterMs !== null) return retryAfterMs;
  const exponential = ALCHEMY_RETRY_BASE_MS * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(5000, exponential + jitter);
}

export async function alchemyRpc(method: string, params: unknown[]) {
  const url = getAlchemyBaseRpcUrl();

  for (let attempt = 0; attempt <= ALCHEMY_RETRY_MAX_ATTEMPTS; attempt += 1) {
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
      cache: "no-store",
    });

    if (!res.ok) {
      const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
      const detail = parseRpcDetail(await res.text());
      const retryable = isRetryableHttpStatus(res.status) || (detail ? isRetryableRpcMessage(detail) : false);
      if (retryable && attempt < ALCHEMY_RETRY_MAX_ATTEMPTS) {
        await sleep(computeRetryDelayMs(attempt, retryAfterMs));
        continue;
      }
      if (detail) {
        throw new Error(`Alchemy RPC ${method} failed: ${res.status} ${res.statusText} - ${detail}`);
      }
      throw new Error(`Alchemy RPC ${method} failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    if (data?.error) {
      const codePart = data.error.code !== undefined ? `${data.error.code} ` : "";
      const message = `${codePart}${data.error.message ?? "Unknown error"}`.trim();
      if (isRetryableRpcMessage(message) && attempt < ALCHEMY_RETRY_MAX_ATTEMPTS) {
        await sleep(computeRetryDelayMs(attempt, null));
        continue;
      }
      throw new Error(`Alchemy RPC ${method} error: ${message}`);
    }

    return data.result;
  }

  throw new Error(`Alchemy RPC ${method} failed after retries`);
}
