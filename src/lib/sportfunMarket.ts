import fs from "node:fs";
import path from "node:path";
import { withCache } from "@/lib/stats/cache";
import { alchemyRpc } from "@/lib/alchemy";
import { getSportfunNameOverride, getSportfunSportLabel, type SportfunSport } from "@/lib/sportfunNames";
import {
  BASE_USDC_DECIMALS,
  FDFPAIR_EVENTS_ABI,
  FDFPAIR_READ_ABI,
  SPORTFUN_PLAYER_TOKENS,
  SPORTFUN_TOPICS,
} from "@/lib/sportfun";
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
  currentPriceUsdcRaw?: string;
  price24hAgoUsdcRaw?: string;
  priceChangeUsdcRaw?: string;
  priceChange24hPercent?: number;
  volume24hSharesRaw?: string;
  trades24h: number;
  lastTradeAt?: string;
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
  distribution: SportfunMarketDistributionBin[];
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
const LOG_CHUNK_BLOCKS = 2500n;
const CACHE_DIR = path.join(process.cwd(), ".cache", "sportfun", "market");

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

function normalizeToHttp(uri: string): string {
  if (uri.startsWith("ipfs://")) {
    let rest = uri.slice("ipfs://".length);
    if (rest.startsWith("ipfs/")) rest = rest.slice("ipfs/".length);
    return `https://ipfs.io/ipfs/${rest}`;
  }
  if (uri.startsWith("ar://")) {
    return `https://arweave.net/${uri.slice("ar://".length)}`;
  }
  return uri;
}

function decodeAbiString(hex: Hex): string {
  const [s] = decodeAbiParameters([{ type: "string" }], hex);
  return String(s);
}

function formatErc1155TokenIdHex(tokenId: bigint): string {
  return tokenId.toString(16).padStart(64, "0");
}

function expandErc1155Uri(template: string, tokenId: bigint): string {
  return template.replace(/\{id\}/gi, formatErc1155TokenIdHex(tokenId));
}

function encodeErc1155UriCall(tokenId: bigint): Hex {
  const selector = "0x0e89341c";
  const tokenHex = tokenId.toString(16).padStart(64, "0");
  return `${selector}${tokenHex}` as Hex;
}

function decodeDataUriJson(uri: string): unknown | null {
  if (!uri.startsWith("data:")) return null;
  const idx = uri.indexOf(",");
  if (idx === -1) return null;
  const meta = uri.slice(0, idx);
  const payload = uri.slice(idx + 1);
  if (!meta.includes("application/json")) return null;
  try {
    if (meta.includes(";base64")) {
      const raw = Buffer.from(payload, "base64").toString("utf8");
      return JSON.parse(raw);
    }
    const raw = decodeURIComponent(payload);
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
  const key = `sportfun:meta:${params.contractAddress}:${params.tokenId.toString(10)}`;
  return withCache(key, 86400, async () => {
    try {
      const data = encodeErc1155UriCall(params.tokenId);
      const result = await alchemyRpc("eth_call", [{ to: params.contractAddress, data }, "latest"]);
      const uriRaw = decodeAbiString(result as Hex);
      if (!uriRaw) return null;

      const jsonInline = decodeDataUriJson(uriRaw);
      const resolvedUri = jsonInline ? null : normalizeToHttp(expandErc1155Uri(uriRaw, params.tokenId));
      const metadata = jsonInline ?? (resolvedUri ? await fetchMetadata(resolvedUri) : null);
      if (!metadata || typeof metadata !== "object") return null;

      const obj = metadata as Record<string, unknown>;
      return {
        name: typeof obj.name === "string" ? obj.name : undefined,
        description: typeof obj.description === "string" ? obj.description : undefined,
        image:
          typeof obj.image_url === "string"
            ? obj.image_url
            : typeof obj.image === "string"
              ? obj.image
              : undefined,
      };
    } catch {
      return null;
    }
  });
}

async function fetchMetadata(url: string) {
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
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

async function getTokenUniverse(sport: SportfunMarketSport, days: number): Promise<string[]> {
  const cache = readTokenCache(sport);
  const cacheFresh = cache && Date.now() - cache.updatedAt < 6 * 60 * 60 * 1000;
  if (cache && cacheFresh) return cache.tokenIds;

  const latest = await getLatestBlock();
  const fromTs = Date.now() - days * 24 * 60 * 60 * 1000;
  const fromBlock = await findBlockByTimestamp(fromTs);
  const events = await getTradeEvents({ sport, fromBlock, toBlock: latest });
  const tokenIds = Array.from(new Set(events.map((e) => e.tokenIdDec))).sort((a, b) => Number(a) - Number(b));
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
}): Promise<SportfunMarketSnapshot> {
  const windowHours = params.windowHours ?? DEFAULT_WINDOW_HOURS;
  const trendDays = params.trendDays ?? DEFAULT_TREND_DAYS;
  const maxTokens = params.maxTokens ?? 250;

  const cacheKey = `sportfun:market:${params.sport}:${windowHours}:${trendDays}:${maxTokens}`;
  return withCache(cacheKey, 120, async () => {
    const latest = await getLatestBlock();
    const now = Date.now();
    const windowStart = now - windowHours * 60 * 60 * 1000;
    const trendStart = now - trendDays * 24 * 60 * 60 * 1000;
    const trendFromBlock = await findBlockByTimestamp(trendStart);

    const events = await getTradeEvents({ sport: params.sport, fromBlock: trendFromBlock, toBlock: latest });
    const tokenAgg = normalizeTokenAgg(events, windowStart);

    const tokenIds = await getTokenUniverse(params.sport, TOKEN_UNIVERSE_DAYS);
    const tokenIdBigInts = tokenIds.map((id) => BigInt(id));

    const contracts = getSportContracts(params.sport);
    const fdfPair = contracts[0].fdfPair;
    const priceMap = await fetchCurrentPrices({ fdfPair, tokenIds: tokenIdBigInts });

    const tokens = tokenIds
      .map((tokenIdDec) => {
        const agg = tokenAgg.get(tokenIdDec);
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
          lastTradeAt: agg?.lastTs ? new Date(agg.lastTs).toISOString() : undefined,
        } as SportfunMarketToken;
      })
      .sort((a, b) => {
        const aPrice = BigInt(a.currentPriceUsdcRaw ?? "0");
        const bPrice = BigInt(b.currentPriceUsdcRaw ?? "0");
        if (aPrice === bPrice) return a.tokenIdDec.localeCompare(b.tokenIdDec);
        return bPrice > aPrice ? 1 : -1;
      });

    const metadataTargets = tokens.slice(0, maxTokens).map((t) => t.tokenIdDec);
    const meta = await mapLimit(metadataTargets, 6, async (tokenIdDec) => {
      const tokenId = BigInt(tokenIdDec);
      const contractAddress = contracts[0].playerToken;
      const metadata = await getErc1155Metadata({ contractAddress, tokenId });
      return { tokenIdDec, metadata };
    });

    const metaByToken = new Map(meta.map((m) => [m.tokenIdDec, m.metadata]));

    const decoratedTokens = tokens.slice(0, maxTokens).map((token) => {
      const metaEntry = metaByToken.get(token.tokenIdDec);
      const override = getSportfunNameOverride(contracts[0].playerToken, token.tokenIdDec);
      return {
        ...token,
        name: override ?? metaEntry?.name ?? undefined,
        image: metaEntry?.image ?? undefined,
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

    const distribution = buildDistribution(prices);
    const trend = buildTrend(events, trendStart);

    return {
      sport: params.sport,
      asOf: new Date(now).toISOString(),
      windowHours,
      trendDays,
      tokens: decoratedTokens,
      summary,
      trend,
      distribution,
    };
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
