import { withCache } from "@/lib/stats/cache";
import {
  BASE_USDC,
  BASE_USDC_DECIMALS,
  SPORTFUN_ERC1155_CONTRACTS,
  SPORTFUN_FDF_PAIR_CONTRACTS,
} from "@/lib/sportfun";
import { env } from "@/lib/env";

type SupabasePriceRow = {
  chain?: string;
  token_address?: string;
  token_id?: string | null;
  price_usdc_raw?: string;
  source?: string;
  as_of?: string;
  updated_at?: string;
};

export type SportfunPriceListRow = {
  chain: string;
  tokenAddress: string;
  tokenId?: string;
  priceUsdcRaw: string;
  source: string;
  asOf?: string;
  updatedAt?: string;
};

export type StoredSportfunPrice = {
  contractAddress: string;
  tokenIdDec?: string;
  priceUsdcRaw: bigint;
  source: string;
  asOf?: string;
  updatedAt?: string;
};

export type SportfunPriceUpsertRow = {
  contractAddress: string;
  tokenIdDec?: string;
  priceUsdcRaw: string;
  source: string;
  asOf?: string;
  providerPayload?: unknown;
};

export type SportfunExternalRefreshResult = {
  status: "disabled" | "skipped" | "ok" | "error";
  reason?: string;
  geckoFound: number;
  dexFound: number;
  merged: number;
  written: number;
  failed?: string;
};

const SPORTFUN_PRICE_TABLE = "sportfun_token_prices";
const CONTRACT_LEVEL_TOKEN_ID = "__contract__";
const SUPABASE_REQUEST_TIMEOUT_MS = 12_000;
const EXTERNAL_REQUEST_TIMEOUT_MS = 12_000;
const GECKO_MAX_ADDRESSES_PER_REQUEST = 20;
const DEX_MAX_ADDRESSES_PER_REQUEST = 30;

let warnedNoSupabase = false;
let warnedSupabasePriceStore = false;
let refreshInFlight: Promise<SportfunExternalRefreshResult> | null = null;
let lastRefreshStartedAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSupabaseConfig(): { baseUrl: string; apiKey: string } | null {
  const baseUrl = env.SUPABASE_PROJECT_URL?.trim().replace(/\/+$/, "");
  const apiKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}

function warnNoSupabaseOnce() {
  if (warnedNoSupabase) return;
  warnedNoSupabase = true;
  console.warn(
    "[sportfun-prices] Supabase is not configured. Set SUPABASE_PROJECT_URL + SUPABASE_SERVICE_ROLE_KEY."
  );
}

function warnSupabasePriceStoreOnce(message: string) {
  if (warnedSupabasePriceStore) return;
  warnedSupabasePriceStore = true;
  console.warn(`[sportfun-prices] ${message}`);
}

function keyForPrice(contractAddress: string, tokenIdDec: string): string {
  return `${contractAddress.toLowerCase()}:${tokenIdDec}`;
}

function contractOnlyKey(contractAddress: string): string {
  return `${contractAddress.toLowerCase()}:*`;
}

function coerceNumericString(value: unknown): string | null {
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return value;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value).toString(10);
  }
  return null;
}

function normalizeInputTokenId(tokenId: string | null | undefined): string | undefined {
  if (typeof tokenId !== "string") return undefined;
  const trimmed = tokenId.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeStoredTokenId(tokenId: string | null | undefined): string | undefined {
  const normalized = normalizeInputTokenId(tokenId);
  if (!normalized) return undefined;
  if (normalized === CONTRACT_LEVEL_TOKEN_ID) return undefined;
  return normalized;
}

function encodeStoredTokenId(tokenId: string | null | undefined): string {
  return normalizeInputTokenId(tokenId) ?? CONTRACT_LEVEL_TOKEN_ID;
}

function parsePriceRaw(value: unknown): bigint | null {
  const s = coerceNumericString(value);
  if (!s) return null;
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

function normalizeListRow(row: SupabasePriceRow): SportfunPriceListRow | null {
  const chain = String(row.chain ?? "base").toLowerCase();
  const tokenAddress = String(row.token_address ?? "").toLowerCase();
  const priceRaw = coerceNumericString(row.price_usdc_raw);
  if (!tokenAddress || !priceRaw) return null;
  return {
    chain,
    tokenAddress,
    tokenId: normalizeStoredTokenId(row.token_id),
    priceUsdcRaw: priceRaw,
    source: String(row.source ?? "unknown"),
    asOf: row.as_of,
    updatedAt: row.updated_at,
  };
}

function decimalToBaseUnits(value: string, decimals: number): bigint | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.startsWith("+") ? trimmed.slice(1) : trimmed;
  const match = normalized.match(/^([0-9]+)(?:\.([0-9]+))?$/);
  if (!match) return null;

  const whole = match[1] ?? "0";
  const fraction = (match[2] ?? "").slice(0, decimals).padEnd(decimals, "0");
  try {
    const wholeRaw = BigInt(whole) * 10n ** BigInt(decimals);
    const fractionRaw = fraction ? BigInt(fraction) : 0n;
    return wholeRaw + fractionRaw;
  } catch {
    return null;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchJsonWithTimeout<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
    const raw = await res.text();
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}${raw ? ` - ${raw.slice(0, 400)}` : ""}`);
    }
    if (!raw) return [] as T;
    return JSON.parse(raw) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function supabaseRequest<T>(pathWithQuery: string, init: RequestInit): Promise<T> {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    warnNoSupabaseOnce();
    throw new Error("supabase_not_configured");
  }
  return fetchJsonWithTimeout<T>(
    `${cfg.baseUrl}/rest/v1/${pathWithQuery}`,
    {
      ...init,
      headers: {
        apikey: cfg.apiKey,
        Authorization: `Bearer ${cfg.apiKey}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    },
    SUPABASE_REQUEST_TIMEOUT_MS
  );
}

export function isSportfunPriceStoreConfigured(): boolean {
  return Boolean(getSupabaseConfig());
}

export async function listStoredSportfunPrices(params?: {
  limit?: number;
  offset?: number;
  tokenIdOnly?: boolean;
}): Promise<SportfunPriceListRow[]> {
  if (!isSportfunPriceStoreConfigured()) {
    warnNoSupabaseOnce();
    return [];
  }

  const limit = Math.max(1, Math.min(2000, params?.limit ?? 200));
  const offset = Math.max(0, params?.offset ?? 0);
  const tokenIdFilter = params?.tokenIdOnly
    ? `&token_id=not.eq.${CONTRACT_LEVEL_TOKEN_ID}`
    : "";

  try {
    const rows = await supabaseRequest<SupabasePriceRow[]>(
      `${SPORTFUN_PRICE_TABLE}?select=chain,token_address,token_id,price_usdc_raw,source,as_of,updated_at&chain=eq.base${tokenIdFilter}&order=as_of.desc.nullslast,updated_at.desc.nullslast&limit=${limit}&offset=${offset}`,
      { method: "GET" }
    );
    const normalizedRows = rows
      .map((row) => normalizeListRow(row))
      .filter((row): row is SportfunPriceListRow => row !== null);
    if (params?.tokenIdOnly) {
      return normalizedRows.filter((row) => row.tokenId !== undefined);
    }
    return normalizedRows;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("supabase_not_configured")) {
      warnSupabasePriceStoreOnce(
        `Unable to list ${SPORTFUN_PRICE_TABLE}. Ensure table exists and REST access is enabled (${message}).`
      );
    }
    return [];
  }
}

async function fetchStoredRowsByContract(contractAddress: string): Promise<SupabasePriceRow[]> {
  const contractLc = contractAddress.toLowerCase();
  const cacheKey = `sportfun:prices:store:${contractLc}`;
  return withCache(cacheKey, 20, async () => {
    try {
      const pageSize = 1000;
      const maxPages = 20;
      const all: SupabasePriceRow[] = [];

      for (let page = 0; page < maxPages; page += 1) {
        const offset = page * pageSize;
        const rows = await supabaseRequest<SupabasePriceRow[]>(
          `${SPORTFUN_PRICE_TABLE}?select=chain,token_address,token_id,price_usdc_raw,source,as_of,updated_at&chain=eq.base&token_address=eq.${contractLc}&order=as_of.desc&limit=${pageSize}&offset=${offset}`,
          { method: "GET" }
        );
        all.push(...rows);
        if (rows.length < pageSize) break;
      }

      return all;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("supabase_not_configured")) {
        warnSupabasePriceStoreOnce(
          `Unable to read ${SPORTFUN_PRICE_TABLE}. Ensure table exists in Supabase (${message}).`
        );
      }
      return [];
    }
  });
}

export async function getStoredSportfunPrices(params: {
  items: Array<{ contractAddress: string; tokenIdDec: string }>;
  allowContractFallback?: boolean;
}): Promise<Map<string, StoredSportfunPrice>> {
  const out = new Map<string, StoredSportfunPrice>();
  if (!params.items.length) return out;

  const byContract = new Map<string, string[]>();
  for (const item of params.items) {
    const contract = item.contractAddress.toLowerCase();
    const list = byContract.get(contract) ?? [];
    list.push(item.tokenIdDec);
    byContract.set(contract, list);
  }

  const rowsByContract = new Map<string, SupabasePriceRow[]>();
  await Promise.all(
    [...byContract.keys()].map(async (contract) => {
      rowsByContract.set(contract, await fetchStoredRowsByContract(contract));
    })
  );

  for (const [contract, tokenIds] of byContract.entries()) {
    const rows = rowsByContract.get(contract) ?? [];
    let contractLevel: StoredSportfunPrice | null = null;
    const tokenSpecific = new Map<string, StoredSportfunPrice>();

    for (const row of rows) {
      const addr = String(row.token_address ?? "").toLowerCase();
      if (!addr || addr !== contract) continue;
      const priceRaw = parsePriceRaw(row.price_usdc_raw);
      if (priceRaw === null) continue;
      const rowTokenId = normalizeStoredTokenId(row.token_id);
      const entry: StoredSportfunPrice = {
        contractAddress: addr,
        tokenIdDec: rowTokenId ?? undefined,
        priceUsdcRaw: priceRaw,
        source: String(row.source ?? "unknown"),
        asOf: row.as_of,
        updatedAt: row.updated_at,
      };
      if (!rowTokenId) {
        if (!contractLevel) contractLevel = entry;
        continue;
      }
      if (!tokenSpecific.has(rowTokenId)) tokenSpecific.set(rowTokenId, entry);
    }

    for (const tokenId of tokenIds) {
      const direct = tokenSpecific.get(tokenId);
      if (direct) {
        out.set(keyForPrice(contract, tokenId), direct);
        continue;
      }
      if (contractLevel && (params.allowContractFallback ?? true)) {
        out.set(keyForPrice(contract, tokenId), contractLevel);
      }
    }
  }

  return out;
}

export async function upsertStoredSportfunPrices(rows: SportfunPriceUpsertRow[]): Promise<number> {
  if (!rows.length) return 0;
  if (!isSportfunPriceStoreConfigured()) {
    warnNoSupabaseOnce();
    return 0;
  }

  const deduped = new Map<string, SportfunPriceUpsertRow>();
  for (const row of rows) {
    const contract = row.contractAddress.toLowerCase();
    const tokenId = encodeStoredTokenId(row.tokenIdDec);
    const key = `${contract}:${tokenId}`;
    const prev = deduped.get(key);
    const normalizedTokenId = normalizeInputTokenId(row.tokenIdDec);
    if (!prev) {
      deduped.set(key, {
        ...row,
        contractAddress: contract,
        tokenIdDec: normalizedTokenId,
      });
      continue;
    }
    const prevAsOf = Date.parse(prev.asOf ?? "");
    const nextAsOf = Date.parse(row.asOf ?? "");
    if (Number.isFinite(nextAsOf) && (!Number.isFinite(prevAsOf) || nextAsOf >= prevAsOf)) {
      deduped.set(key, {
        ...row,
        contractAddress: contract,
        tokenIdDec: normalizedTokenId,
      });
    }
  }

  const payload = [...deduped.values()].map((row) => ({
    chain: "base",
    token_address: row.contractAddress.toLowerCase(),
    token_id: encodeStoredTokenId(row.tokenIdDec),
    price_usdc_raw: row.priceUsdcRaw,
    source: row.source,
    as_of: row.asOf ?? new Date().toISOString(),
    provider_payload: row.providerPayload ?? null,
  }));

  try {
    await supabaseRequest<unknown>(
      `${SPORTFUN_PRICE_TABLE}?on_conflict=chain,token_address,token_id`,
      {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(payload),
      }
    );
    return payload.length;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("supabase_not_configured")) {
      warnSupabasePriceStoreOnce(
        `Unable to upsert into ${SPORTFUN_PRICE_TABLE}. Ensure table exists in Supabase (${message}).`
      );
    }
    return 0;
  }
}

type ExternalPriceCandidate = {
  priceUsdRaw: string;
  source: "geckoterminal" | "dexscreener";
  payload?: unknown;
};

async function fetchGeckoPrices(tokenAddresses: string[]): Promise<Map<string, ExternalPriceCandidate>> {
  const out = new Map<string, ExternalPriceCandidate>();
  for (const group of chunk(tokenAddresses, GECKO_MAX_ADDRESSES_PER_REQUEST)) {
    if (!group.length) continue;
    const url = `https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${group.join(",")}`;
    try {
      const data = await fetchJsonWithTimeout<{
        data?: { attributes?: { token_prices?: Record<string, string> } };
      }>(url, { method: "GET" }, EXTERNAL_REQUEST_TIMEOUT_MS);
      const prices = data?.data?.attributes?.token_prices ?? {};
      for (const [addrRaw, priceStr] of Object.entries(prices)) {
        const addr = addrRaw.toLowerCase();
        const raw = decimalToBaseUnits(String(priceStr), BASE_USDC_DECIMALS);
        if (raw === null) continue;
        out.set(addr, {
          priceUsdRaw: raw.toString(10),
          source: "geckoterminal",
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      // Gecko free tier may return 429; skip this cycle and continue.
      console.warn(`[sportfun-prices] geckoterminal fetch failed: ${message}`);
    }
    await sleep(150);
  }
  return out;
}

type DexPair = {
  baseToken?: { address?: string };
  priceUsd?: string;
  liquidity?: { usd?: number | string };
  pairAddress?: string;
  dexId?: string;
};

function dexLiquidityUsd(pair: DexPair): number {
  const raw = pair.liquidity?.usd;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function fetchDexPrices(tokenAddresses: string[]): Promise<Map<string, ExternalPriceCandidate>> {
  const bestByToken = new Map<string, { pair: DexPair; liquidity: number }>();

  for (const group of chunk(tokenAddresses, DEX_MAX_ADDRESSES_PER_REQUEST)) {
    if (!group.length) continue;
    const url = `https://api.dexscreener.com/tokens/v1/base/${group.join(",")}`;
    try {
      const rows = await fetchJsonWithTimeout<DexPair[]>(url, { method: "GET" }, EXTERNAL_REQUEST_TIMEOUT_MS);
      for (const row of rows ?? []) {
        const token = row.baseToken?.address?.toLowerCase();
        if (!token) continue;
        if (!group.includes(token)) continue;
        const priceRaw = decimalToBaseUnits(String(row.priceUsd ?? ""), BASE_USDC_DECIMALS);
        if (priceRaw === null) continue;
        const liquidity = dexLiquidityUsd(row);
        const prev = bestByToken.get(token);
        if (!prev || liquidity >= prev.liquidity) {
          bestByToken.set(token, {
            pair: { ...row, priceUsd: priceRaw.toString(10) },
            liquidity,
          });
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[sportfun-prices] dexscreener fetch failed: ${message}`);
    }
    await sleep(150);
  }

  const out = new Map<string, ExternalPriceCandidate>();
  for (const [token, best] of bestByToken.entries()) {
    const priceRaw = coerceNumericString(best.pair.priceUsd);
    if (!priceRaw) continue;
    out.set(token, {
      priceUsdRaw: priceRaw,
      source: "dexscreener",
      payload: {
        pairAddress: best.pair.pairAddress,
        dexId: best.pair.dexId,
        liquidityUsd: best.liquidity,
      },
    });
  }
  return out;
}

function parseExtraExternalTokenAddresses(): string[] {
  const raw = env.SPORTFUN_EXTERNAL_PRICE_TOKENS ?? "";
  if (!raw.trim()) return [];
  return raw
    .split(/[,\s]+/)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => /^0x[0-9a-f]{40}$/.test(x));
}

function getDefaultExternalTokenAddresses(): string[] {
  return [
    BASE_USDC,
    "0x16ee7ecac70d1028e7712751e2ee6ba808a7dd92", // FUN
    ...SPORTFUN_ERC1155_CONTRACTS,
    ...SPORTFUN_FDF_PAIR_CONTRACTS,
    ...parseExtraExternalTokenAddresses(),
  ]
    .map((x) => x.toLowerCase())
    .filter((x, idx, arr) => arr.indexOf(x) === idx);
}

export async function refreshSportfunExternalPrices(params?: {
  reason?: string;
}): Promise<SportfunExternalRefreshResult> {
  if (!env.SPORTFUN_PRICE_SYNC_ENABLED) {
    return {
      status: "disabled",
      reason: "SPORTFUN_PRICE_SYNC_ENABLED=false",
      geckoFound: 0,
      dexFound: 0,
      merged: 0,
      written: 0,
    };
  }

  if (!isSportfunPriceStoreConfigured()) {
    return {
      status: "disabled",
      reason: "supabase_not_configured",
      geckoFound: 0,
      dexFound: 0,
      merged: 0,
      written: 0,
    };
  }

  const tokenAddresses = getDefaultExternalTokenAddresses();
  if (!tokenAddresses.length) {
    return {
      status: "skipped",
      reason: "no_tokens",
      geckoFound: 0,
      dexFound: 0,
      merged: 0,
      written: 0,
    };
  }

  try {
    const [gecko, dex] = await Promise.all([
      fetchGeckoPrices(tokenAddresses),
      fetchDexPrices(tokenAddresses),
    ]);

    const merged = new Map<string, ExternalPriceCandidate>();
    for (const token of tokenAddresses) {
      const geckoValue = gecko.get(token);
      const dexValue = dex.get(token);
      if (geckoValue) {
        merged.set(token, geckoValue);
        continue;
      }
      if (dexValue) merged.set(token, dexValue);
    }

    const asOf = new Date().toISOString();
    const upserts: SportfunPriceUpsertRow[] = [...merged.entries()].map(([token, entry]) => ({
      contractAddress: token,
      priceUsdcRaw: entry.priceUsdRaw,
      source: entry.source,
      asOf,
      providerPayload: {
        provider: entry.source,
        reason: params?.reason,
        ...(entry.payload ? { payload: entry.payload } : {}),
      },
    }));

    const written = await upsertStoredSportfunPrices(upserts);
    return {
      status: "ok",
      geckoFound: gecko.size,
      dexFound: dex.size,
      merged: merged.size,
      written,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "error",
      geckoFound: 0,
      dexFound: 0,
      merged: 0,
      written: 0,
      failed: message,
    };
  }
}

export function triggerSportfunExternalPricesRefresh(params?: {
  force?: boolean;
  reason?: string;
}): void {
  if (!env.SPORTFUN_PRICE_SYNC_ENABLED) return;

  const now = Date.now();
  const minIntervalMs = env.SPORTFUN_PRICE_REFRESH_MINUTES * 60_000;
  if (!params?.force && now - lastRefreshStartedAt < minIntervalMs) return;
  if (refreshInFlight) return;

  lastRefreshStartedAt = now;
  refreshInFlight = refreshSportfunExternalPrices({ reason: params?.reason })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[sportfun-prices] background refresh failed: ${message}`);
      return {
        status: "error",
        geckoFound: 0,
        dexFound: 0,
        merged: 0,
        written: 0,
        failed: message,
      } as SportfunExternalRefreshResult;
    })
    .finally(() => {
      refreshInFlight = null;
    });
}

export function tokenPriceMapKey(contractAddress: string, tokenIdDec: string): string {
  return keyForPrice(contractAddress, tokenIdDec);
}

export function tokenContractFallbackPriceKey(contractAddress: string): string {
  return contractOnlyKey(contractAddress);
}
