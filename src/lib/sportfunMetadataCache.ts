import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const SPORTFUN_METADATA_CACHE_TTL_MS = 1000 * 60 * 60 * 24;

export type SportfunTokenMetadata = {
  name?: string;
  description?: string;
  image?: string;
  attributes?: unknown;
};

export type SportfunMetadataCacheEntry = {
  updatedAt: number;
  uri?: string;
  metadata?: SportfunTokenMetadata | null;
  error?: string;
};

type SportfunMetadataCacheFile = {
  updatedAt: number;
  entries: Record<string, SportfunMetadataCacheEntry>;
};

const CACHE_DIR = process.env.SPORTFUN_METADATA_CACHE_DIR ?? path.join(os.tmpdir(), "pff-sportfun");
const CACHE_PATH = path.join(CACHE_DIR, "erc1155-metadata.json");

let memoryCache: SportfunMetadataCacheFile | null = null;

function readCacheFile(): SportfunMetadataCacheFile {
  if (memoryCache) return memoryCache;
  try {
    const raw = fs.readFileSync(CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as SportfunMetadataCacheFile;
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid cache");
    if (!parsed.entries || typeof parsed.entries !== "object") throw new Error("Invalid cache");
    memoryCache = { updatedAt: parsed.updatedAt ?? 0, entries: parsed.entries };
  } catch {
    memoryCache = { updatedAt: 0, entries: {} };
  }
  return memoryCache;
}

function writeCacheFile(cache: SportfunMetadataCacheFile) {
  memoryCache = cache;
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), "utf8");
  } catch {
    // ignore cache write errors
  }
}

export function isSportfunMetadataFresh(
  entry: SportfunMetadataCacheEntry | null | undefined,
  nowMs = Date.now()
): entry is SportfunMetadataCacheEntry {
  if (!entry) return false;
  return nowMs - entry.updatedAt < SPORTFUN_METADATA_CACHE_TTL_MS;
}

export function getSportfunMetadataCacheEntry(key: string): SportfunMetadataCacheEntry | null {
  const cache = readCacheFile();
  return cache.entries[key] ?? null;
}

export function setSportfunMetadataCacheEntry(key: string, entry: SportfunMetadataCacheEntry): void {
  const cache = readCacheFile();
  cache.entries[key] = entry;
  cache.updatedAt = Date.now();
  writeCacheFile(cache);
}
