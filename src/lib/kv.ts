import "server-only";

type KvResult<T> = {
  result?: T;
  error?: string;
};

function stripQuotes(value: string | undefined): string | undefined {
  if (!value) return value;
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

const REST_URL = stripQuotes(process.env.UPSTASH_REDIS_REST_URL);
const REST_TOKEN = stripQuotes(process.env.UPSTASH_REDIS_REST_TOKEN);
const KV_ENABLED = Boolean(REST_URL && REST_TOKEN);

async function kvCommand<T>(cmd: Array<string | number>): Promise<T | null> {
  if (!KV_ENABLED || !REST_URL || !REST_TOKEN) return null;
  try {
    const res = await fetch(REST_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REST_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cmd),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as KvResult<T>;
    if (data.error) return null;
    return data.result ?? null;
  } catch {
    return null;
  }
}

export async function kvGetJson<T>(key: string): Promise<T | null> {
  const raw = await kvCommand<string>(["GET", key]);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function kvSetJson(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
  try {
    const raw = JSON.stringify(value);
    return kvSetRaw(key, raw, ttlSeconds);
  } catch {
    return false;
  }
}

export async function kvSetRaw(key: string, raw: string, ttlSeconds?: number): Promise<boolean> {
  if (!KV_ENABLED) return false;
  const cmd = ttlSeconds ? ["SET", key, raw, "EX", ttlSeconds] : ["SET", key, raw];
  const result = await kvCommand<string>(cmd);
  return result === "OK";
}

export function kvEnabled(): boolean {
  return KV_ENABLED;
}
