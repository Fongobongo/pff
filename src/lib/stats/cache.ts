import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();
const CACHE_DIR = process.env.STATS_CACHE_DIR ?? path.join(os.tmpdir(), "pff-stats-cache");

function cachePathForKey(key: string): string {
  const hash = createHash("sha1").update(key).digest("hex");
  return path.join(CACHE_DIR, hash.slice(0, 2), `${hash}.json`);
}

function readDiskCache<T>(key: string): T | undefined {
  try {
    const filePath = cachePathForKey(key);
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed || typeof parsed.expiresAt !== "number") return undefined;
    if (Date.now() > parsed.expiresAt) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore
      }
      return undefined;
    }
    return parsed.value;
  } catch {
    return undefined;
  }
}

function writeDiskCache<T>(key: string, value: T, ttlSeconds: number) {
  try {
    const filePath = cachePathForKey(key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const entry: CacheEntry<T> = {
      value,
      expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000,
    };
    fs.writeFileSync(filePath, JSON.stringify(entry), "utf8");
  } catch {
    // ignore cache write failures
  }
}

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
  const diskCached = readDiskCache<T>(key);
  if (diskCached !== undefined) {
    setCached(key, diskCached, ttlSeconds);
    return diskCached;
  }
  const value = await loader();
  setCached(key, value, ttlSeconds);
  writeDiskCache(key, value, ttlSeconds);
  return value;
}
