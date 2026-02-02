type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | undefined {
  const entry = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return undefined;
  }
  return entry.value;
}

export function setCached<T>(key: string, value: T, ttlSeconds: number) {
  const ttl = Math.max(1, ttlSeconds);
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttl * 1000,
  });
}

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  const cached = getCached<T>(key);
  if (cached !== undefined) return cached;
  const value = await loader();
  setCached(key, value, ttlSeconds);
  return value;
}
