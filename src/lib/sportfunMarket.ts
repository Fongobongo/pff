import fs from "node:fs";
import path from "node:path";
import { withCache } from "@/lib/stats/cache";
import { alchemyRpc } from "@/lib/alchemy";
import {
  getNflFallbackTokenMeta,
  type NflFallbackSource,
} from "@/lib/nfl/nflFunFallback";
import { getSportfunNameOverride, getSportfunSportLabel, type SportfunSport } from "@/lib/sportfunNames";
import {
  getSportfunMetadataCacheEntry,
  isSportfunMetadataFresh,
  setSportfunMetadataCacheEntry,
} from "@/lib/sportfunMetadataCache";
import {
  BASE_USDC_DECIMALS,
  DEVPLAYERS_EVENTS_ABI,
  FDFPAIR_EVENTS_ABI,
  FDFPAIR_READ_ABI,
  SPORTFUN_PLAYER_TOKENS,
  SPORTFUN_TOPICS,
  getSportfunAthleteMetadataDefaults,
} from "@/lib/sportfun";
import { resolveSportfunMetadataFromUri } from "@/lib/sportfunMetadata";
import {
  decodeAbiParameters,
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  type Hex,
} from "viem";

export type SportfunMarketSport = Exclude<SportfunSport, "unknown">;

export type SportfunMarketToken = {
  tokenIdDec: string;
  name?: string;
  image?: string;
  description?: string;
  attributes?: unknown;
  position?: string;
  team?: string;
  supply?: number;
  currentPriceUsdcRaw?: string;
  price24hAgoUsdcRaw?: string;
  priceChangeUsdcRaw?: string;
  priceChange24hPercent?: number;
  volume24hSharesRaw?: string;
  trades24h: number;
  lastTradeAt?: string;
  isTradeable?: boolean;
  metadataSource?: "onchain" | "fallback" | "hybrid" | "override" | "none";
};

export type SportfunMarketSummary = {
  totalTokens: number;
  activeTokens24h: number;
  trades24h: number;
  volume24hSharesRaw: string;
  priceAvgUsdcRaw?: string;
  priceMedianUsdcRaw?: string;
  priceMinUsdcRaw?: string;
  priceMaxUsdcRaw?: string;
};

export type SportfunMarketTrendPoint = {
  ts: number;
  avgPriceUsdcRaw?: string;
  volumeSharesRaw: string;
  trades: number;
};

export type SportfunMarketDistributionBin = {
  label: string;
  minUsdcRaw?: string;
  maxUsdcRaw?: string;
  count: number;
};

export type SportfunMarketSnapshot = {
  sport: SportfunMarketSport;
  asOf: string;
  windowHours: number;
  trendDays: number;
  tokens: SportfunMarketToken[];
  summary: SportfunMarketSummary;
  trend: SportfunMarketTrendPoint[];
  trendGainers: SportfunMarketTrendPoint[];
  trendLosers: SportfunMarketTrendPoint[];
  distribution: SportfunMarketDistributionBin[];
  stats?: {
    metadataSourceCounts: {
      onchainOnly: number;
      fallbackOnly: number;
      hybrid: number;
      overrideOnly: number;
      unresolved: number;
    };
    fallbackFeed: {
      source: NflFallbackSource | "n/a";
      staleAgeMs?: number;
    };
  };
};

type TradeEvent = {
  tokenIdDec: string;
  priceUsdcPerShareRaw?: bigint;
  shareAmountRaw: bigint;
  timestampMs: number;
};

type TokenAgg = {
  firstPrice?: bigint;
  lastPrice?: bigint;
  firstTs?: number;
  lastTs?: number;
  volumeSharesRaw: bigint;
  trades: number;
};

const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_TREND_DAYS = 30;
const TOKEN_UNIVERSE_DAYS = 180;
const TOKEN_UNIVERSE_START_MS = Date.UTC(2025, 7, 1);
const LOG_CHUNK_BLOCKS = 2500n;
const MAX_TRANSFER_PAGES = 20;
const CACHE_DIR = path.join(process.cwd(), ".cache", "sportfun", "market");
const MARKET_SNAPSHOT_STALE_MS = 24 * 60 * 60 * 1000;

const PRICE_DISTRIBUTION_BINS: Array<{ label: string; min?: number; max?: number }> = [
  { label: "< $1", max: 1 },
  { label: "$1 - $5", min: 1, max: 5 },
  { label: "$5 - $10", min: 5, max: 10 },
  { label: "$10 - $25", min: 10, max: 25 },
  { label: "$25 - $50", min: 25, max: 50 },
  { label: "$50 - $100", min: 50, max: 100 },
  { label: "> $100", min: 100 },
];

function toHex(value: bigint): Hex {
  return `0x${value.toString(16)}` as Hex;
}

function parseBigIntish(value: unknown): bigint {
  if (typeof value !== "string") throw new Error(`Expected string, got ${typeof value}`);
  if (value.startsWith("0x") || value.startsWith("0X")) return BigInt(value);
  return BigInt(value);
}

function decodeAbiString(hex: Hex): string {
  const [s] = decodeAbiParameters([{ type: "string" }], hex);
  return String(s);
}

function encodeErc1155UriCall(tokenId: bigint): Hex {
  const selector = "0x0e89341c";
  const tokenHex = tokenId.toString(16).padStart(64, "0");
  return `${selector}${tokenHex}` as Hex;
}


function extractAttributeValue(attributes: unknown, matchKey: (key: string) => boolean): unknown {
  if (!attributes) return undefined;
  if (Array.isArray(attributes)) {
    for (const entry of attributes) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const key = String(record.trait_type ?? record.traitType ?? record.name ?? record.key ?? "").toLowerCase();
      if (!key) continue;
      if (matchKey(key)) return record.value ?? record.val ?? record.text ?? record.content;
    }
  }
  if (typeof attributes === "object") {
    for (const [key, value] of Object.entries(attributes as Record<string, unknown>)) {
      if (matchKey(key.toLowerCase())) return value;
    }
  }
  return undefined;
}

function parseNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function normalizePosition(raw: string): string {
  const value = raw.trim().toUpperCase();
  if (value.includes("QUARTERBACK") || value === "QB") return "QB";
  if (value.includes("RUNNING BACK") || value === "RB") return "RB";
  if (value.includes("WIDE RECEIVER") || value === "WR") return "WR";
  if (value.includes("TIGHT END") || value === "TE") return "TE";
  if (value.includes("KICKER") || value === "K") return "K";
  if (value.includes("DEF") || value.includes("DST")) return "DST";
  return value;
}

function extractPosition(attributes: unknown): string | null {
  const raw = extractAttributeValue(attributes, (key) => key.includes("position") || key === "pos");
  if (typeof raw === "string" && raw.trim()) return normalizePosition(raw);
  return null;
}

function extractTeam(attributes: unknown): string | null {
  const raw = extractAttributeValue(attributes, (key) => key.includes("team") || key.includes("club"));
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

function extractSupply(attributes: unknown): number | null {
  const raw = extractAttributeValue(
    attributes,
    (key) => key.includes("supply") || key.includes("shares") || key.includes("outstanding")
  );
  const parsed = parseNumericValue(raw);
  if (parsed === null) return null;
  if (parsed > 1e12) return parsed / 1e18;
  return parsed;
}

function sumBigInt(values: bigint[]): bigint {
  return values.reduce((acc, v) => acc + v, 0n);
}

async function getLatestBlock(): Promise<bigint> {
  const result = await alchemyRpc("eth_blockNumber", []);
  return BigInt(result);
}

async function getBlockTimestampMs(blockNumber: bigint): Promise<number> {
  const cacheKey = `sportfun:block-ts:${blockNumber.toString()}`;
  const cached = await withCache(cacheKey, 86400, async () => {
    const block = await alchemyRpc("eth_getBlockByNumber", [toHex(blockNumber), false]);
    const ts = Number(BigInt(block.timestamp));
    return ts * 1000;
  });
  return cached;
}

async function findBlockByTimestamp(targetMs: number): Promise<bigint> {
  const key = `sportfun:block-at:${Math.floor(targetMs / 1000)}`;
  const cached = await withCache(key, 3600, async () => {
    const latest = await getLatestBlock();
    let low = 0n;
    let high = latest;
    let iter = 0;
    while (low + 1n < high && iter < 40) {
      iter += 1;
      const mid = (low + high) / 2n;
      const ts = await getBlockTimestampMs(mid);
      if (ts < targetMs) {
        low = mid;
      } else {
        high = mid;
      }
    }
    return high.toString(10);
  });
  return BigInt(cached);
}

type RpcLog = {
  address: string;
  data: Hex;
  topics: Hex[];
  blockNumber: Hex;
  transactionHash?: Hex;
};

type AssetTransfer = {
  tokenId?: string;
  erc1155Metadata?: Array<{ tokenId?: string }>;
};

function parseTokenId(value?: string): string | null {
  if (!value) return null;
  try {
    return value.startsWith("0x") || value.startsWith("0X") ? BigInt(value).toString(10) : BigInt(value).toString(10);
  } catch {
    return null;
  }
}

function extractTokenIdsFromTransfer(transfer: AssetTransfer): string[] {
  const ids: string[] = [];
  const meta = Array.isArray(transfer.erc1155Metadata) ? transfer.erc1155Metadata : [];
  for (const entry of meta) {
    const parsed = parseTokenId(entry?.tokenId);
    if (parsed) ids.push(parsed);
  }
  if (!ids.length) {
    const parsed = parseTokenId(transfer.tokenId);
    if (parsed) ids.push(parsed);
  }
  return ids;
}

async function fetchLogsChunk(params: {
  addresses: string[];
  topic0: string;
  fromBlock: bigint;
  toBlock: bigint;
}): Promise<RpcLog[]> {
  const filter = {
    address: params.addresses,
    topics: [params.topic0],
    fromBlock: toHex(params.fromBlock),
    toBlock: toHex(params.toBlock),
  };
  return alchemyRpc("eth_getLogs", [filter]);
}

async function fetchLogs(params: {
  addresses: string[];
  topic0: string;
  fromBlock: bigint;
  toBlock: bigint;
}): Promise<RpcLog[]> {
  const logs: RpcLog[] = [];
  let start = params.fromBlock;
  let chunk = LOG_CHUNK_BLOCKS;
  while (start <= params.toBlock) {
    let end = start + chunk - 1n;
    if (end > params.toBlock) end = params.toBlock;
    try {
      const batch = await fetchLogsChunk({ ...params, fromBlock: start, toBlock: end });
      logs.push(...batch);
      start = end + 1n;
    } catch (err) {
      if (chunk <= 200n) throw err;
      chunk = chunk / 2n;
    }
  }
  return logs;
}

function decodeTradeLog(log: RpcLog): Array<{ tokenIdDec: string; priceRaw?: bigint; shareAmountRaw: bigint }> {
  if (!log.topics?.length) return [];
  const topic0 = String(log.topics[0]).toLowerCase();
  if (topic0 !== SPORTFUN_TOPICS.PlayerTokensPurchase && topic0 !== SPORTFUN_TOPICS.CurrencyPurchase) return [];

  const decoded = decodeEventLog({
    abi: FDFPAIR_EVENTS_ABI,
    data: log.data,
    topics: log.topics as [Hex, ...Hex[]],
  });

  if (!decoded.args) return [];

  const items: Array<{ tokenIdDec: string; priceRaw?: bigint; shareAmountRaw: bigint }> = [];

  if (decoded.eventName === "PlayerTokensPurchase") {
    const ids = decoded.args.playerTokenIds as readonly bigint[];
    const amounts = decoded.args.playerTokenAmountsToBuy as readonly bigint[];
    const currencySpent = decoded.args.currencySpent as readonly bigint[];

    for (let i = 0; i < ids.length; i += 1) {
      const shareAmount = amounts[i] ?? 0n;
      const currency = currencySpent[i] ?? 0n;
      const price = shareAmount > 0n ? (currency * 10n ** 18n) / shareAmount : undefined;
      items.push({
        tokenIdDec: ids[i]?.toString(10),
        priceRaw: price,
        shareAmountRaw: shareAmount,
      });
    }
  }

  if (decoded.eventName === "CurrencyPurchase") {
    const ids = decoded.args.playerTokenIds as readonly bigint[];
    const amounts = decoded.args.playerTokenAmountsSold as readonly bigint[];
    const currencyReceived = decoded.args.currencyReceived as readonly bigint[];

    for (let i = 0; i < ids.length; i += 1) {
      const shareAmount = amounts[i] ?? 0n;
      const currency = currencyReceived[i] ?? 0n;
      const price = shareAmount > 0n ? (currency * 10n ** 18n) / shareAmount : undefined;
      items.push({
        tokenIdDec: ids[i]?.toString(10),
        priceRaw: price,
        shareAmountRaw: shareAmount,
      });
    }
  }

  return items.filter((item) => item.tokenIdDec);
}

function decodePromotionLog(log: RpcLog): string[] {
  if (!log.topics?.length) return [];
  const topic0 = String(log.topics[0]).toLowerCase();
  if (topic0 !== SPORTFUN_TOPICS.PlayerSharesPromoted) return [];

  try {
    const decoded = decodeEventLog({
      abi: DEVPLAYERS_EVENTS_ABI,
      data: log.data,
      topics: log.topics as [Hex, ...Hex[]],
    });

    if (!decoded.args || decoded.eventName !== "PlayerSharesPromoted") return [];
    const ids = decoded.args.playerTokenIds as readonly bigint[];
    return ids.map((id) => id.toString(10));
  } catch {
    return [];
  }
}

function getSportContracts(sport: SportfunMarketSport) {
  const contracts = SPORTFUN_PLAYER_TOKENS.filter(
    (item) => getSportfunSportLabel(item.playerToken) === sport
  );
  if (!contracts.length) {
    throw new Error(`No Sport.fun contracts configured for ${sport}`);
  }
  return contracts;
}

async function getTradeEvents(params: {
  sport: SportfunMarketSport;
  fromBlock: bigint;
  toBlock: bigint;
}): Promise<TradeEvent[]> {
  const contracts = getSportContracts(params.sport);
  const fdfPairs = contracts.map((c) => c.fdfPair.toLowerCase());

  const [buys, sells] = await Promise.all([
    fetchLogs({
      addresses: fdfPairs,
      topic0: SPORTFUN_TOPICS.PlayerTokensPurchase,
      fromBlock: params.fromBlock,
      toBlock: params.toBlock,
    }),
    fetchLogs({
      addresses: fdfPairs,
      topic0: SPORTFUN_TOPICS.CurrencyPurchase,
      fromBlock: params.fromBlock,
      toBlock: params.toBlock,
    }),
  ]);

  const logs = [...buys, ...sells];
  if (!logs.length) return [];

  const blockNumbers = new Set<bigint>();
  for (const log of logs) {
    try {
      blockNumbers.add(parseBigIntish(log.blockNumber));
    } catch {
      // ignore
    }
  }

  const blockTimestamps = new Map<string, number>();
  const blocks = Array.from(blockNumbers);
  await mapLimit(blocks, 6, async (blockNumber) => {
    const ts = await getBlockTimestampMs(blockNumber);
    blockTimestamps.set(blockNumber.toString(10), ts);
  });

  const events: TradeEvent[] = [];

  for (const log of logs) {
    const blockNumber = parseBigIntish(log.blockNumber);
    const timestampMs = blockTimestamps.get(blockNumber.toString(10));
    if (!timestampMs) continue;
    const decoded = decodeTradeLog(log);
    for (const item of decoded) {
      events.push({
        tokenIdDec: item.tokenIdDec,
        priceUsdcPerShareRaw: item.priceRaw,
        shareAmountRaw: item.shareAmountRaw,
        timestampMs,
      });
    }
  }

  return events;
}

async function fetchCurrentPrices(params: {
  fdfPair: string;
  tokenIds: bigint[];
}): Promise<Map<string, bigint>> {
  const priceMap = new Map<string, bigint>();
  const batchSize = 200;
  for (let i = 0; i < params.tokenIds.length; i += batchSize) {
    const slice = params.tokenIds.slice(i, i + batchSize);
    if (!slice.length) continue;
    const data = encodeFunctionData({
      abi: FDFPAIR_READ_ABI,
      functionName: "getPrices",
      args: [slice],
    });
    const result = await alchemyRpc("eth_call", [{ to: params.fdfPair, data }, "latest"]);
    const decoded = decodeFunctionResult({
      abi: FDFPAIR_READ_ABI,
      functionName: "getPrices",
      data: result,
    }) as readonly bigint[];
    for (let j = 0; j < slice.length; j += 1) {
      const tokenId = slice[j];
      const price = decoded[j];
      if (price !== undefined) {
        priceMap.set(tokenId.toString(10), price);
      }
    }
  }
  return priceMap;
}

async function getErc1155Metadata(params: { contractAddress: string; tokenId: bigint }) {
  const cacheKey = `${params.contractAddress}:${params.tokenId.toString(10)}`;
  const { template, defaultTemplate } = getSportfunAthleteMetadataDefaults();
  const key = `sportfun:meta:${cacheKey}:${template}`;
  return withCache(key, 86400, async () => {
    const now = Date.now();
    const localCached = getSportfunMetadataCacheEntry(cacheKey);
    const templateChanged = Boolean(localCached?.template && localCached.template !== template);
    if (isSportfunMetadataFresh(localCached, now) && !templateChanged) {
      return localCached?.metadata ?? null;
    }
    try {
      const cachedUri = !templateChanged ? localCached?.uri : undefined;
      if (cachedUri) {
        const resolved = await resolveSportfunMetadataFromUri({
          uriRaw: cachedUri,
          tokenId: params.tokenId,
          template,
          defaultTemplate,
        });
        if (resolved.metadata) {
          setSportfunMetadataCacheEntry(cacheKey, {
            updatedAt: now,
            uri: resolved.resolvedUri ?? cachedUri,
            metadata: resolved.metadata,
            template,
          });
          return resolved.metadata;
        }
      }

      const data = encodeErc1155UriCall(params.tokenId);
      const result = await alchemyRpc("eth_call", [{ to: params.contractAddress, data }, "latest"]);
      const uriRaw = decodeAbiString(result as Hex).trim();
      if (!uriRaw) return null;

      const resolved = await resolveSportfunMetadataFromUri({
        uriRaw,
        tokenId: params.tokenId,
        template,
        defaultTemplate,
      });
      const parsed = resolved.metadata;
      setSportfunMetadataCacheEntry(cacheKey, {
        updatedAt: now,
        uri: resolved.resolvedUri ?? localCached?.uri,
        metadata: parsed ?? null,
        template,
      });
      return parsed;
    } catch {
      if (localCached) {
        setSportfunMetadataCacheEntry(cacheKey, {
          updatedAt: now,
          uri: localCached.uri,
          metadata: localCached.metadata ?? null,
          template,
        });
      }
      return localCached?.metadata ?? null;
    }
  });
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]);
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => worker());
  await Promise.all(workers);
  return out;
}

function bucketDay(tsMs: number): number {
  const d = new Date(tsMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function percentile(sorted: bigint[], pct: number): bigint | undefined {
  if (!sorted.length) return undefined;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * pct)));
  return sorted[idx];
}

function ensureCacheDir() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function tokenCachePath(sport: SportfunMarketSport) {
  ensureCacheDir();
  return path.join(CACHE_DIR, `tokens-${sport}.json`);
}

function marketSnapshotPath(sport: SportfunMarketSport) {
  ensureCacheDir();
  return path.join(CACHE_DIR, `snapshot-${sport}.json`);
}

function readMarketSnapshotFallback(sport: SportfunMarketSport): SportfunMarketSnapshot | null {
  try {
    const raw = fs.readFileSync(marketSnapshotPath(sport), "utf8");
    const parsed = JSON.parse(raw) as { updatedAt?: number; snapshot?: SportfunMarketSnapshot };
    if (!parsed?.snapshot || typeof parsed.updatedAt !== "number") return null;
    if (Date.now() - parsed.updatedAt > MARKET_SNAPSHOT_STALE_MS) return null;
    return parsed.snapshot;
  } catch {
    return null;
  }
}

function writeMarketSnapshotFallback(sport: SportfunMarketSport, snapshot: SportfunMarketSnapshot) {
  try {
    fs.writeFileSync(
      marketSnapshotPath(sport),
      JSON.stringify({ updatedAt: Date.now(), snapshot }),
      "utf8"
    );
  } catch {
    // ignore
  }
}

function readTokenCache(sport: SportfunMarketSport): { tokenIds: string[]; updatedAt: number } | null {
  try {
    const raw = fs.readFileSync(tokenCachePath(sport), "utf8");
    const parsed = JSON.parse(raw) as { tokenIds: string[]; updatedAt: number };
    if (!parsed || !Array.isArray(parsed.tokenIds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeTokenCache(sport: SportfunMarketSport, tokenIds: string[]) {
  try {
    fs.writeFileSync(tokenCachePath(sport), JSON.stringify({ tokenIds, updatedAt: Date.now() }), "utf8");
  } catch {
    // ignore
  }
}

async function getTokenUniverseFromTransfers(
  sport: SportfunMarketSport,
  fromBlock: bigint,
  toBlock: bigint
): Promise<string[]> {
  const contracts = getSportContracts(sport);
  const addresses = contracts.map((contract) => contract.playerToken);
  const tokenIds = new Set<string>();
  let pageKey: string | undefined;
  let pages = 0;

  while (pages < MAX_TRANSFER_PAGES) {
    const params: Record<string, unknown> = {
      fromBlock: toHex(fromBlock),
      toBlock: toHex(toBlock),
      category: ["erc1155"],
      contractAddresses: addresses,
      withMetadata: false,
      maxCount: "0x3e8",
      order: "desc",
    };
    if (pageKey) params.pageKey = pageKey;

    const result = (await alchemyRpc("alchemy_getAssetTransfers", [params])) as {
      transfers?: AssetTransfer[];
      pageKey?: string;
    };

    const transfers = Array.isArray(result?.transfers) ? result.transfers : [];
    for (const transfer of transfers) {
      for (const tokenId of extractTokenIdsFromTransfer(transfer)) {
        tokenIds.add(tokenId);
      }
    }

    pageKey = result?.pageKey;
    pages += 1;
    if (!pageKey) break;
  }

  return Array.from(tokenIds);
}

async function getTokenUniverse(sport: SportfunMarketSport, days: number): Promise<string[]> {
  const cache = readTokenCache(sport);
  const cacheFresh = cache && Date.now() - cache.updatedAt < 6 * 60 * 60 * 1000;
  if (cache && cacheFresh) return cache.tokenIds;

  const latest = await getLatestBlock();
  const fromTs = Math.min(Date.now() - days * 24 * 60 * 60 * 1000, TOKEN_UNIVERSE_START_MS);
  const fromBlock = await findBlockByTimestamp(fromTs);
  let tradeTokenIds: string[] = [];
  try {
    const events = await getTradeEvents({ sport, fromBlock, toBlock: latest });
    tradeTokenIds = events.map((e) => e.tokenIdDec);
  } catch {
    tradeTokenIds = [];
  }

  const contracts = getSportContracts(sport);
  const devPlayers = contracts.map((c) => c.developmentPlayers?.toLowerCase()).filter(Boolean) as string[];
  let promoTokenIds: string[] = [];
  if (devPlayers.length) {
    try {
      const promoLogs = await fetchLogs({
        addresses: devPlayers,
        topic0: SPORTFUN_TOPICS.PlayerSharesPromoted,
        fromBlock,
        toBlock: latest,
      });
      promoTokenIds = promoLogs.flatMap(decodePromotionLog);
    } catch {
      promoTokenIds = [];
    }
  }

  const tokenSet = new Set<string>([...(cache?.tokenIds ?? []), ...tradeTokenIds, ...promoTokenIds]);
  if (!tokenSet.size) {
    const transferTokenIds = await getTokenUniverseFromTransfers(sport, fromBlock, latest);
    transferTokenIds.forEach((tokenId) => tokenSet.add(tokenId));
  }
  const tokenIds = Array.from(tokenSet).sort((a, b) => Number(a) - Number(b));
  if (!tokenIds.length && cache?.tokenIds?.length) return cache.tokenIds;
  writeTokenCache(sport, tokenIds);
  return tokenIds;
}

function buildDistribution(prices: bigint[]): SportfunMarketDistributionBin[] {
  return PRICE_DISTRIBUTION_BINS.map((bin) => {
    const minRaw = bin.min !== undefined ? BigInt(Math.floor(bin.min * 10 ** BASE_USDC_DECIMALS)) : undefined;
    const maxRaw = bin.max !== undefined ? BigInt(Math.floor(bin.max * 10 ** BASE_USDC_DECIMALS)) : undefined;
    const count = prices.filter((p) => {
      if (minRaw !== undefined && p < minRaw) return false;
      if (maxRaw !== undefined && p >= maxRaw) return false;
      return true;
    }).length;
    return {
      label: bin.label,
      minUsdcRaw: minRaw?.toString(10),
      maxUsdcRaw: maxRaw?.toString(10),
      count,
    };
  });
}

function normalizeTokenAgg(events: TradeEvent[], windowStart: number): Map<string, TokenAgg> {
  const map = new Map<string, TokenAgg>();
  for (const e of events) {
    if (e.timestampMs < windowStart) continue;
    const entry = map.get(e.tokenIdDec) ?? {
      volumeSharesRaw: 0n,
      trades: 0,
    };
    entry.trades += 1;
    const absShares = e.shareAmountRaw < 0n ? -e.shareAmountRaw : e.shareAmountRaw;
    entry.volumeSharesRaw += absShares;
    if (e.priceUsdcPerShareRaw !== undefined) {
      if (!entry.firstTs || e.timestampMs < entry.firstTs) {
        entry.firstTs = e.timestampMs;
        entry.firstPrice = e.priceUsdcPerShareRaw;
      }
      if (!entry.lastTs || e.timestampMs > entry.lastTs) {
        entry.lastTs = e.timestampMs;
        entry.lastPrice = e.priceUsdcPerShareRaw;
      }
    }
    if (!entry.lastTs || e.timestampMs > entry.lastTs) {
      entry.lastTs = e.timestampMs;
    }
    map.set(e.tokenIdDec, entry);
  }
  return map;
}

function buildTrend(events: TradeEvent[], trendStart: number): SportfunMarketTrendPoint[] {
  const buckets = new Map<number, { volume: bigint; trades: number; priceVolume: bigint; priceShares: bigint }>();
  for (const e of events) {
    if (e.timestampMs < trendStart) continue;
    const bucket = bucketDay(e.timestampMs);
    const entry = buckets.get(bucket) ?? { volume: 0n, trades: 0, priceVolume: 0n, priceShares: 0n };
    const absShares = e.shareAmountRaw < 0n ? -e.shareAmountRaw : e.shareAmountRaw;
    entry.volume += absShares;
    entry.trades += 1;
    if (e.priceUsdcPerShareRaw !== undefined && absShares > 0n) {
      entry.priceVolume += e.priceUsdcPerShareRaw * absShares;
      entry.priceShares += absShares;
    }
    buckets.set(bucket, entry);
  }

  const points = Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([ts, entry]) => {
      const avgPrice = entry.priceShares > 0n ? entry.priceVolume / entry.priceShares : undefined;
      return {
        ts,
        avgPriceUsdcRaw: avgPrice?.toString(10),
        volumeSharesRaw: entry.volume.toString(10),
        trades: entry.trades,
      };
    });
  return points;
}

export async function getSportfunMarketSnapshot(params: {
  sport: SportfunMarketSport;
  windowHours?: number;
  trendDays?: number;
  maxTokens?: number;
  metadataLimit?: number;
}): Promise<SportfunMarketSnapshot> {
  const windowHours = params.windowHours ?? DEFAULT_WINDOW_HOURS;
  const trendDays = params.trendDays ?? DEFAULT_TREND_DAYS;
  const maxTokens = params.maxTokens ?? 250;
  const metadataLimit = params.metadataLimit ?? Math.max(maxTokens, 500);

  const cacheKey = `sportfun:market:${params.sport}:${windowHours}:${trendDays}:${maxTokens}:${metadataLimit}`;
  return withCache(cacheKey, 120, async () => {
    const now = Date.now();
    try {
      const latest = await getLatestBlock();
      const windowStart = now - windowHours * 60 * 60 * 1000;
      const trendStart = now - trendDays * 24 * 60 * 60 * 1000;
      const windowFromBlock = await findBlockByTimestamp(windowStart);
      const trendFromBlock =
        trendStart < windowStart ? await findBlockByTimestamp(trendStart) : windowFromBlock;

      let windowEvents: TradeEvent[] = [];
      let windowEventsError = false;
      try {
        windowEvents = await getTradeEvents({
          sport: params.sport,
          fromBlock: windowFromBlock,
          toBlock: latest,
        });
      } catch (error: unknown) {
        windowEventsError = true;
        windowEvents = [];
        console.warn(
          `[sportfun-market] window trade fetch failed sport=${params.sport} windowHours=${windowHours}: ${describeError(error)}`
        );
      }

      let events = windowEvents;
      if (trendFromBlock < windowFromBlock) {
        try {
          const historicalEvents = await getTradeEvents({
            sport: params.sport,
            fromBlock: trendFromBlock,
            toBlock: windowFromBlock - 1n,
          });
          events = [...historicalEvents, ...windowEvents];
        } catch (error: unknown) {
          console.warn(
            `[sportfun-market] historical trend fetch failed sport=${params.sport} trendDays=${trendDays}: ${describeError(error)}`
          );
        }
      }

      const tokenAgg = normalizeTokenAgg(events, windowStart);
      const lastTradeByToken = new Map<string, { ts: number; price?: bigint }>();
      for (const event of events) {
        const current = lastTradeByToken.get(event.tokenIdDec);
        if (!current || event.timestampMs > current.ts) {
          lastTradeByToken.set(event.tokenIdDec, {
            ts: event.timestampMs,
            price: event.priceUsdcPerShareRaw,
          });
        }
      }

      const nflFallbackResultPromise =
        params.sport === "nfl" ? getNflFallbackTokenMeta() : Promise.resolve(null);

      let tokenIds: string[] = [];
      try {
        tokenIds = await getTokenUniverse(params.sport, TOKEN_UNIVERSE_DAYS);
      } catch {
        tokenIds = [];
      }

      const nflFallbackResult = await nflFallbackResultPromise;
      if (!tokenIds.length && nflFallbackResult?.rows.length) {
        tokenIds = Array.from(new Set(nflFallbackResult.rows.map((row) => row.tokenIdDec))).sort((a, b) => {
          const left = BigInt(a);
          const right = BigInt(b);
          if (left === right) return 0;
          return left < right ? -1 : 1;
        });
        console.warn(
          `[sportfun-market] using fallback token universe sport=${params.sport} count=${tokenIds.length} source=${nflFallbackResult.source}`
        );
      }

      const tokenIdBigInts = tokenIds.map((id) => BigInt(id));

      const contracts = getSportContracts(params.sport);
      const fdfPair = contracts[0].fdfPair;
      let priceMap = new Map<string, bigint>();
      if (tokenIdBigInts.length) {
        try {
          priceMap = await fetchCurrentPrices({ fdfPair, tokenIds: tokenIdBigInts });
        } catch {
          priceMap = new Map<string, bigint>();
        }
      }

      const tokens = tokenIds
        .map((tokenIdDec) => {
          const agg = tokenAgg.get(tokenIdDec);
          const lastTrade = lastTradeByToken.get(tokenIdDec);
          const lastTradeAt = agg?.lastTs ?? lastTrade?.ts;
          const currentPrice = priceMap.get(tokenIdDec);
          const firstPrice = agg?.firstPrice;
          const lastPrice = agg?.lastPrice;
          const priceChange =
            currentPrice !== undefined && firstPrice !== undefined
              ? currentPrice - firstPrice
              : lastPrice !== undefined && firstPrice !== undefined
                ? lastPrice - firstPrice
                : undefined;
          const priceChangePct =
            firstPrice && priceChange !== undefined
              ? Number(priceChange) / Number(firstPrice)
              : undefined;
          return {
            tokenIdDec,
            currentPriceUsdcRaw: currentPrice?.toString(10),
            price24hAgoUsdcRaw: firstPrice?.toString(10),
            priceChangeUsdcRaw: priceChange?.toString(10),
            priceChange24hPercent: priceChangePct !== undefined ? priceChangePct * 100 : undefined,
            volume24hSharesRaw: agg ? agg.volumeSharesRaw.toString(10) : "0",
            trades24h: agg ? agg.trades : 0,
            lastTradeAt: lastTradeAt ? new Date(lastTradeAt).toISOString() : undefined,
          } as SportfunMarketToken;
        })
        .sort((a, b) => {
          const aPrice = BigInt(a.currentPriceUsdcRaw ?? "0");
          const bPrice = BigInt(b.currentPriceUsdcRaw ?? "0");
          if (aPrice === bPrice) return a.tokenIdDec.localeCompare(b.tokenIdDec);
          return bPrice > aPrice ? 1 : -1;
        });

      const metadataPool = [
        ...tokens.filter((t) => t.trades24h === 0),
        ...tokens.filter((t) => t.trades24h > 0),
      ];
      const metadataTargets = metadataPool
        .slice(0, Math.min(tokens.length, metadataLimit))
        .map((t) => t.tokenIdDec);
      const meta = await mapLimit(metadataTargets, 6, async (tokenIdDec) => {
        const tokenId = BigInt(tokenIdDec);
        const contractAddress = contracts[0].playerToken;
        const metadata = await getErc1155Metadata({ contractAddress, tokenId });
        return { tokenIdDec, metadata };
      });

      const metaByToken = new Map(meta.map((m) => [m.tokenIdDec, m.metadata]));
      const nflFallbackByToken = nflFallbackResult
        ? new Map(nflFallbackResult.rows.map((row) => [row.tokenIdDec, row]))
        : null;
      const metadataSourceCounts = {
        onchainOnly: 0,
        fallbackOnly: 0,
        hybrid: 0,
        overrideOnly: 0,
        unresolved: 0,
      };

      const decoratedTokens = tokens.map((token) => {
        const metaEntry = metaByToken.get(token.tokenIdDec);
        const fallbackMeta = nflFallbackByToken?.get(token.tokenIdDec);
        const override = getSportfunNameOverride(contracts[0].playerToken, token.tokenIdDec);
        const onchainPosition = extractPosition(metaEntry?.attributes);
        const onchainTeam = extractTeam(metaEntry?.attributes);
        const usedOnchain = Boolean(metaEntry?.name || onchainPosition || onchainTeam);
        const usedFallback = Boolean(
          (!metaEntry?.name && fallbackMeta?.name) ||
            (!onchainPosition && fallbackMeta?.position) ||
            (!onchainTeam && fallbackMeta?.team)
        );
        let metadataSource: SportfunMarketToken["metadataSource"] = "none";
        if (usedOnchain && usedFallback) {
          metadataSource = "hybrid";
          metadataSourceCounts.hybrid += 1;
        } else if (usedOnchain) {
          metadataSource = "onchain";
          metadataSourceCounts.onchainOnly += 1;
        } else if (usedFallback) {
          metadataSource = "fallback";
          metadataSourceCounts.fallbackOnly += 1;
        } else if (override) {
          metadataSource = "override";
          metadataSourceCounts.overrideOnly += 1;
        } else {
          metadataSourceCounts.unresolved += 1;
        }
        const fallbackAttributes = fallbackMeta
          ? [
              ...(fallbackMeta.position
                ? [{ trait_type: "position", value: fallbackMeta.position }]
                : []),
              ...(fallbackMeta.team ? [{ trait_type: "team", value: fallbackMeta.team }] : []),
              ...(fallbackMeta.supply !== undefined
                ? [{ trait_type: "circulating_supply", value: fallbackMeta.supply }]
                : []),
            ]
          : undefined;
        const attributes = metaEntry?.attributes ?? fallbackAttributes;
        const position = extractPosition(attributes) ?? fallbackMeta?.position;
        const team = extractTeam(attributes) ?? fallbackMeta?.team;
        const supply = extractSupply(attributes) ?? fallbackMeta?.supply;
        return {
          ...token,
          name: override ?? metaEntry?.name ?? fallbackMeta?.name ?? undefined,
          image: metaEntry?.image ?? fallbackMeta?.image ?? undefined,
          description: metaEntry?.description ?? undefined,
          attributes,
          position: position ?? undefined,
          team: team ?? undefined,
          supply: supply ?? undefined,
          isTradeable: fallbackMeta?.isTradeable,
          metadataSource,
        };
      });

      const prices = tokens
        .map((t) => (t.currentPriceUsdcRaw ? BigInt(t.currentPriceUsdcRaw) : null))
        .filter((v): v is bigint => v !== null)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

      const summary: SportfunMarketSummary = {
        totalTokens: tokens.length,
        activeTokens24h: tokenAgg.size,
        trades24h: Array.from(tokenAgg.values()).reduce((acc, item) => acc + item.trades, 0),
        volume24hSharesRaw: sumBigInt(Array.from(tokenAgg.values()).map((item) => item.volumeSharesRaw)).toString(10),
        priceAvgUsdcRaw: prices.length ? (sumBigInt(prices) / BigInt(prices.length)).toString(10) : undefined,
        priceMedianUsdcRaw: percentile(prices, 0.5)?.toString(10),
        priceMinUsdcRaw: prices[0]?.toString(10),
        priceMaxUsdcRaw: prices[prices.length - 1]?.toString(10),
      };

      const gainersSet = new Set<string>();
      const losersSet = new Set<string>();
      for (const token of tokens) {
        const change = token.priceChange24hPercent ?? 0;
        if (change > 0) gainersSet.add(token.tokenIdDec);
        if (change < 0) losersSet.add(token.tokenIdDec);
      }

      const distribution = buildDistribution(prices);
      const trend = buildTrend(events, trendStart);
      const trendGainers =
        gainersSet.size > 0 ? buildTrend(events.filter((e) => gainersSet.has(e.tokenIdDec)), trendStart) : [];
      const trendLosers =
        losersSet.size > 0 ? buildTrend(events.filter((e) => losersSet.has(e.tokenIdDec)), trendStart) : [];

      const snapshot: SportfunMarketSnapshot = {
        sport: params.sport,
        asOf: new Date(now).toISOString(),
        windowHours,
        trendDays,
        tokens: decoratedTokens,
        summary,
        trend,
        trendGainers,
        trendLosers,
        distribution,
        stats: {
          metadataSourceCounts,
          fallbackFeed: {
            source: nflFallbackResult?.source ?? "n/a",
            staleAgeMs: nflFallbackResult?.staleAgeMs,
          },
        },
      };
      if (snapshot.tokens.length > 0) {
        const activityDegraded = windowEventsError && snapshot.summary.trades24h === 0;
        if (!activityDegraded) {
          writeMarketSnapshotFallback(params.sport, snapshot);
        } else {
          console.warn(
            `[sportfun-market] preserving last-good snapshot due degraded activity sport=${params.sport} trades24h=${snapshot.summary.trades24h}`
          );
          const staleSnapshot = readMarketSnapshotFallback(params.sport);
          if (
            staleSnapshot?.tokens?.length &&
            staleSnapshot.summary?.trades24h &&
            staleSnapshot.summary.trades24h > 0
          ) {
            console.warn(
              `[sportfun-market] using stale activity snapshot sport=${params.sport} staleTrades24h=${staleSnapshot.summary.trades24h}`
            );
            return staleSnapshot;
          }
        }
        return snapshot;
      }

      const staleSnapshot = readMarketSnapshotFallback(params.sport);
      if (staleSnapshot?.tokens?.length) {
        console.warn(
          `[sportfun-market] using stale market snapshot fallback sport=${params.sport} tokens=${staleSnapshot.tokens.length}`
        );
        return staleSnapshot;
      }
      return snapshot;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[sportfun-market] snapshot build failed sport=${params.sport}: ${message}`);
      const staleSnapshot = readMarketSnapshotFallback(params.sport);
      if (staleSnapshot?.tokens?.length) {
        console.warn(
          `[sportfun-market] using stale market snapshot fallback sport=${params.sport} after error tokens=${staleSnapshot.tokens.length}`
        );
        return staleSnapshot;
      }
      return {
        sport: params.sport,
        asOf: new Date(now).toISOString(),
        windowHours,
        trendDays,
        tokens: [],
        summary: {
          totalTokens: 0,
          activeTokens24h: 0,
          trades24h: 0,
          volume24hSharesRaw: "0",
          priceAvgUsdcRaw: undefined,
          priceMedianUsdcRaw: undefined,
          priceMinUsdcRaw: undefined,
          priceMaxUsdcRaw: undefined,
        },
        trend: [],
        trendGainers: [],
        trendLosers: [],
        distribution: buildDistribution([]),
        stats: {
          metadataSourceCounts: {
            onchainOnly: 0,
            fallbackOnly: 0,
            hybrid: 0,
            overrideOnly: 0,
            unresolved: 0,
          },
          fallbackFeed: {
            source: params.sport === "nfl" ? "empty" : "n/a",
          },
        },
      };
    }
  });
}

export function toUsdNumber(raw?: string, decimals = BASE_USDC_DECIMALS): number {
  if (!raw) return 0;
  const neg = raw.startsWith("-");
  const abs = BigInt(neg ? raw.slice(1) : raw);
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = abs % base;
  const fracNum = Number(fraction) / Number(base);
  const value = Number(whole) + fracNum;
  return neg ? -value : value;
}
