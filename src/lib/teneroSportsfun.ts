import { env } from "@/lib/env";
import { withCache } from "@/lib/stats/cache";

const DEFAULT_TENERO_BASE_URL = "https://api.tenero.io";
const REQUEST_TIMEOUT_MS = 12_000;

type QueryPrimitive = string | number | boolean;
type QueryValue = QueryPrimitive | QueryPrimitive[] | null | undefined;
type QueryParams = Record<string, QueryValue>;

type TeneroEnvelope<T> = {
  statusCode?: number;
  message?: string;
  data: T;
  error?: string;
};

export class TeneroRequestError extends Error {
  readonly statusCode: number;
  readonly url: string;
  readonly payload?: unknown;

  constructor(message: string, statusCode: number, url: string, payload?: unknown) {
    super(message);
    this.name = "TeneroRequestError";
    this.statusCode = statusCode;
    this.url = url;
    this.payload = payload;
  }
}

export function isTeneroRequestError(error: unknown): error is TeneroRequestError {
  return error instanceof TeneroRequestError;
}

export type TeneroCursorPage<T> = {
  rows: T[];
  next: string | null;
};

export type SportsfunTokenRow = {
  address: string;
  symbol: string;
  name: string;
  image_url?: string;
  holder_count: number;
  pool_count: number;
  total_liquidity_usd: number;
  marketcap_usd: number;
  total_marketcap_usd: number;
  price_usd: number;
  metrics: {
    volume_1d_usd?: number;
    swaps_1d?: number;
    buys_1d?: number;
    sells_1d?: number;
    [key: string]: number | null | undefined;
  };
  price: {
    current_price?: number;
    price_change_1h_pct?: number | null;
    price_change_4h_pct?: number | null;
    price_change_1d_pct?: number | null;
    price_change_7d_pct?: number | null;
    price_change_30d_pct?: number | null;
    [key: string]: number | null | undefined;
  };
  [key: string]: unknown;
};

export type SportsfunPoolRow = {
  pool_id: string;
  pool_platform: string;
  liquidity_usd: number;
  marketcap_usd: number;
  total_marketcap_usd: number;
  base_token: {
    address: string;
    symbol: string;
    name: string;
    image_url?: string;
    holder_count?: number;
  };
  quote_token: {
    address: string;
    symbol: string;
    name: string;
    image_url?: string;
  };
  metrics: {
    volume_1d_usd?: number;
    swaps_1d?: number;
    buys_1d?: number;
    sells_1d?: number;
    [key: string]: number | null | undefined;
  };
  price: {
    current_price?: number;
    price_change_1h_pct?: number | null;
    price_change_4h_pct?: number | null;
    price_change_1d_pct?: number | null;
    price_change_7d_pct?: number | null;
    price_change_30d_pct?: number | null;
    [key: string]: number | null | undefined;
  };
  [key: string]: unknown;
};

export type SportsfunMarketStatsPoint = {
  period: string;
  volume_usd: number;
  buy_volume_usd: number;
  sell_volume_usd: number;
  netflow_usd: number;
  unique_traders: number;
  unique_buyers: number;
  unique_sellers: number;
  unique_pools: number;
};

export type SportsfunWalletNetflowRow = {
  wallet: string;
  wallet_name: string | null;
  buys: string;
  sells: string;
  swaps: string;
  buy_volume_usd: number;
  sell_volume_usd: number;
  netflow_usd: number;
};

export type SportsfunHourlyNetflowPoint = {
  timestamp: number;
  netflow: number;
};

export type SportsfunWhaleTradeRow = {
  tx_id: string;
  pool_id: string;
  pool_platform: string;
  event_type: string;
  maker: string;
  maker_name: string | null;
  recipient: string;
  recipient_name: string | null;
  base_token_address: string;
  quote_token_address: string;
  amount_usd: number;
  price_usd: number;
  block_height: number;
  block_time: number;
  [key: string]: unknown;
};

export type SportsfunWalletDetails = {
  address: string;
  name: string | null;
  native_transfer:
    | {
        tx_id: string;
        amount: number;
        transfer_time: number | string;
        sender: {
          address: string;
          name: string | null;
        };
      }
    | null;
  first_and_last_tx:
    | {
        first_tx_id: string;
        first_tx_time: number;
        last_tx_id: string;
        last_tx_time: number;
      }
    | null;
};

export type SportsfunWalletTradeStats = {
  buy_count: number;
  sell_count: number;
  swap_count: number;
  add_liquidity_count: number;
  remove_liquidity_count: number;
  liquidity_count: number;
  total_trades: number;
  buy_volume_usd: number;
  sell_volume_usd: number;
  swap_volume_usd: number;
  add_volume_usd: number;
  remove_volume_usd: number;
  liquidity_volume_usd: number;
  total_volume_usd: number;
  avg_buy_volume_usd: number;
  avg_sell_volume_usd: number;
  avg_swap_volume_usd: number;
  avg_add_volume_usd: number;
  avg_remove_volume_usd: number;
  avg_liquidity_volume_usd: number;
  trade_netflow_usd: number;
  liquidity_netflow_usd: number;
  unique_pools_traded: number;
  unique_pools_liquidity: number;
  unique_pools_total: number;
  unique_tokens_traded: number;
  unique_tokens_liquidity: number;
  unique_tokens_total: number;
  unique_platforms_traded: number;
  unique_platforms_liquidity: number;
  unique_platforms_total: number;
};

export type SportsfunWalletDailyTradeStatsPoint = {
  date: string;
  buy_count: number;
  sell_count: number;
  buy_volume_usd: number;
  sell_volume_usd: number;
  netflow_usd: number;
};

export type SportsfunWalletHolding = {
  token_address: string;
  balance: number | string;
  credits: number | string;
  debits: number | string;
  fees: number | string;
  balance_value_usd: number;
  start_holding_at: number;
  last_active_at: number;
  token: {
    address: string;
    symbol: string;
    name: string;
    image_url?: string;
    price_usd?: number;
  };
  trade_stats: {
    buy_tx_count: number;
    sell_tx_count: number;
    buy_amount: number;
    sell_amount: number;
    netflow_amount: number;
    buy_amount_usd: number;
    sell_amount_usd: number;
    netflow_amount_usd: number;
    avg_buy_price_usd: number;
    avg_sell_price_usd: number;
    first_trade_time: number;
    last_trade_time: number;
    total_tx_count: number;
    total_volume_usd: number;
    realized_pnl_usd: number;
  };
};

export type SportsfunWalletHoldingsValue = {
  wallet_address: string;
  native_amount: number;
  native_value_usd: number;
  token_value_usd: number;
  total_value_usd: number;
  total_raw_value_usd: number;
  total_adjusted_value_usd: number;
  token_count: number;
};

export type SportsfunWalletTradeRow = {
  tx_id: string;
  tx_index: number;
  event_index: number;
  pool_id: string;
  pool_platform: string;
  event_type: string;
  maker: string;
  maker_name: string | null;
  recipient: string;
  recipient_name: string | null;
  base_token_address: string;
  quote_token_address: string;
  base_token_amount: string;
  quote_token_amount: string;
  amount_usd: number;
  price_usd: number;
  block_height: number;
  block_time: number;
  [key: string]: unknown;
};

export type SportsfunWalletTransferRow = {
  tx_id: string;
  tx_index: number;
  event_index: number;
  token_address: string;
  from_address: string;
  to_address: string;
  from_name: string | null;
  to_name: string | null;
  raw_amount: string;
  amount: number;
  transfer_type: string;
  is_trade: boolean;
  block_height: number;
  block_time: number;
  token: {
    address: string;
    symbol: string;
    name: string;
    image_url?: string;
  };
};

export type SportsfunWalletPnlDistribution = {
  wallet_address: string;
  winrate: number;
  pnl_lt_50_neg: number;
  pnl_neg50_to_0: number;
  pnl_0_to_200: number;
  pnl_200_to_500: number;
  pnl_gt_500: number;
  realized_pnl_lt_50_neg: number;
  realized_pnl_neg50_to_0: number;
  realized_pnl_0_to_200: number;
  realized_pnl_200_to_500: number;
  realized_pnl_gt_500: number;
  total_tokens_with_trade_data: number;
};

export type SportsfunAuthGateResult<T> = {
  data: T | null;
  authRequired: boolean;
};

export type SportsfunMarketStatsTimeframe = "30d" | "90d" | "180d" | "1y";
export type SportsfunGainerTimeframe = "1h" | "4h" | "1d" | "7d" | "30d";
export type SportsfunFlowTimeframe = "1h" | "4h" | "1d" | "7d" | "30d" | "all";
export type SportsfunHourlyNetflowTimeframe = "1d" | "7d" | "30d" | "90d";
export type SportsfunWalletTradeStatsTimeframe = "1d" | "7d" | "30d" | "all";

export type SportsfunTokensParams = {
  limit?: number;
  cursor?: string;
  order?: string;
  direction?: "asc" | "desc" | "ASC" | "DESC";
  search?: string;
  min_holder_count?: number;
  max_holder_count?: number;
  min_total_liquidity_usd?: number;
  max_total_liquidity_usd?: number;
  min_marketcap_usd?: number;
  max_marketcap_usd?: number;
  min_volume_1d_usd?: number;
  max_volume_1d_usd?: number;
  min_swaps_1d?: number;
  max_swaps_1d?: number;
};

export type SportsfunPoolsParams = {
  limit?: number;
  cursor?: string;
  order?: string;
  direction?: "asc" | "desc" | "ASC" | "DESC";
  search?: string;
  pool_platform?: string;
  min_liquidity_usd?: number;
  max_liquidity_usd?: number;
  min_volume_1d_usd?: number;
  max_volume_1d_usd?: number;
  min_swaps_1d?: number;
  max_swaps_1d?: number;
};

export type SportsfunWalletListParams = {
  limit?: number;
  cursor?: string;
};

export type SportsfunWalletDailyStatsParams = {
  timeframe?: SportsfunWalletTradeStatsTimeframe;
  fromDate?: string;
  toDate?: string;
};

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function getTeneroBaseUrl(): string {
  const fromEnv = env.TENERO_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return DEFAULT_TENERO_BASE_URL;
}

function buildUrl(pathname: string, params?: QueryParams): string {
  const url = new URL(pathname, getTeneroBaseUrl());
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
      },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function decodeEnvelope<T>(response: Response, url: string): Promise<T> {
  const raw = await response.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    throw new TeneroRequestError(`Tenero returned invalid JSON (${response.status})`, response.status, url, raw);
  }

  if (!response.ok) {
    const envelope = parsed as Partial<TeneroEnvelope<unknown>> | null;
    const message = String(envelope?.message ?? envelope?.error ?? response.statusText ?? "Request failed");
    throw new TeneroRequestError(message, response.status, url, parsed);
  }

  if (!parsed || typeof parsed !== "object" || !("data" in parsed)) {
    throw new TeneroRequestError("Tenero payload missing `data` field", response.status, url, parsed);
  }

  const envelope = parsed as TeneroEnvelope<T>;
  if ((envelope.statusCode ?? 200) >= 400) {
    throw new TeneroRequestError(
      String(envelope.message ?? envelope.error ?? "Tenero error response"),
      Number(envelope.statusCode ?? 500),
      url,
      parsed
    );
  }

  return envelope.data;
}

async function requestTenero<T>(opts: {
  pathname: string;
  params?: QueryParams;
  cacheTtlSeconds?: number;
}): Promise<T> {
  const url = buildUrl(opts.pathname, opts.params);
  const loader = async () => {
    const response = await fetchWithTimeout(url);
    return decodeEnvelope<T>(response, url);
  };
  const ttl = Math.max(0, Math.trunc(opts.cacheTtlSeconds ?? 0));
  if (ttl > 0) {
    return withCache<T>(`tenero:${url}`, ttl, loader);
  }
  return loader();
}

function timeframeToFromDate(timeframe: SportsfunWalletTradeStatsTimeframe): string | undefined {
  if (timeframe === "all") return undefined;
  const days = timeframe === "1d" ? 1 : timeframe === "7d" ? 7 : 30;
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function requestAuthGated<T>(pathname: string): Promise<SportsfunAuthGateResult<T>> {
  try {
    const data = await requestTenero<T>({
      pathname,
      cacheTtlSeconds: 20,
    });
    return { data, authRequired: false };
  } catch (error: unknown) {
    if (isTeneroRequestError(error) && error.statusCode === 401) {
      return { data: null, authRequired: true };
    }
    throw error;
  }
}

export async function getSportsfunTokens(
  params: SportsfunTokensParams = {}
): Promise<TeneroCursorPage<SportsfunTokenRow>> {
  return requestTenero<TeneroCursorPage<SportsfunTokenRow>>({
    pathname: "/v1/sportsfun/tokens",
    params,
    cacheTtlSeconds: 20,
  });
}

export async function getSportsfunPools(
  params: SportsfunPoolsParams = {}
): Promise<TeneroCursorPage<SportsfunPoolRow>> {
  return requestTenero<TeneroCursorPage<SportsfunPoolRow>>({
    pathname: "/v1/sportsfun/pools",
    params,
    cacheTtlSeconds: 20,
  });
}

export async function getSportsfunMarketStats(
  timeframe: SportsfunMarketStatsTimeframe = "30d"
): Promise<SportsfunMarketStatsPoint[]> {
  return requestTenero<SportsfunMarketStatsPoint[]>({
    pathname: "/v1/sportsfun/market/stats",
    params: { timeframe },
    cacheTtlSeconds: 25,
  });
}

export async function getSportsfunTopGainers(
  timeframe: SportsfunGainerTimeframe = "1d"
): Promise<SportsfunTokenRow[]> {
  return requestTenero<SportsfunTokenRow[]>({
    pathname: "/v1/sportsfun/market/top_gainers",
    params: { timeframe },
    cacheTtlSeconds: 20,
  });
}

export async function getSportsfunTopInflows(
  timeframe: SportsfunFlowTimeframe = "1d"
): Promise<SportsfunWalletNetflowRow[]> {
  return requestTenero<SportsfunWalletNetflowRow[]>({
    pathname: "/v1/sportsfun/market/top_inflows",
    params: { timeframe },
    cacheTtlSeconds: 20,
  });
}

export async function getSportsfunTopOutflows(
  timeframe: SportsfunFlowTimeframe = "1d"
): Promise<SportsfunWalletNetflowRow[]> {
  return requestTenero<SportsfunWalletNetflowRow[]>({
    pathname: "/v1/sportsfun/market/top_outflows",
    params: { timeframe },
    cacheTtlSeconds: 20,
  });
}

export async function getSportsfunWhaleTrades(
  minAmountUsd: 5000 | 10000 | 20000 | 50000 | 100000 | 200000 = 10_000,
  limit = 100
): Promise<SportsfunWhaleTradeRow[]> {
  const page = await requestTenero<TeneroCursorPage<SportsfunWhaleTradeRow>>({
    pathname: "/v1/sportsfun/market/whale_trades",
    params: {
      min_amount_usd: minAmountUsd,
      limit: Math.max(1, Math.min(200, Math.trunc(limit))),
    },
    cacheTtlSeconds: 20,
  });
  return page.rows;
}

export async function getSportsfunHourlyNetflow(
  timeframe: SportsfunHourlyNetflowTimeframe = "7d"
): Promise<SportsfunHourlyNetflowPoint[]> {
  return requestTenero<SportsfunHourlyNetflowPoint[]>({
    pathname: "/v1/sportsfun/market/hourly_netflow",
    params: { timeframe },
    cacheTtlSeconds: 20,
  });
}

export async function getSportsfunWallet(address: string): Promise<SportsfunWalletDetails> {
  return requestTenero<SportsfunWalletDetails>({
    pathname: `/v1/sportsfun/wallets/${address}`,
    cacheTtlSeconds: 15,
  });
}

export async function getSportsfunWalletTradeStats(
  address: string,
  timeframe: SportsfunWalletTradeStatsTimeframe = "7d"
): Promise<SportsfunWalletTradeStats> {
  return requestTenero<SportsfunWalletTradeStats>({
    pathname: `/v1/sportsfun/wallets/${address}/trade_stats`,
    params: { timeframe },
    cacheTtlSeconds: 15,
  });
}

export async function getSportsfunWalletDailyTradeStats(
  address: string,
  params: SportsfunWalletDailyStatsParams = {}
): Promise<SportsfunWalletDailyTradeStatsPoint[]> {
  const fromDate = params.fromDate ?? (params.timeframe ? timeframeToFromDate(params.timeframe) : undefined);
  const toDate = params.toDate;
  return requestTenero<SportsfunWalletDailyTradeStatsPoint[]>({
    pathname: `/v1/sportsfun/wallets/${address}/daily_trade_stats`,
    params: {
      from_date: fromDate,
      to_date: toDate,
    },
    cacheTtlSeconds: 15,
  });
}

export async function getSportsfunWalletHoldings(
  address: string,
  params: SportsfunWalletListParams = {}
): Promise<TeneroCursorPage<SportsfunWalletHolding>> {
  return requestTenero<TeneroCursorPage<SportsfunWalletHolding>>({
    pathname: `/v1/sportsfun/wallets/${address}/holdings`,
    params: {
      limit: params.limit,
      cursor: params.cursor,
    },
    cacheTtlSeconds: 15,
  });
}

export async function getSportsfunWalletHoldingsValue(address: string): Promise<SportsfunWalletHoldingsValue> {
  return requestTenero<SportsfunWalletHoldingsValue>({
    pathname: `/v1/sportsfun/wallets/${address}/holdings_value`,
    cacheTtlSeconds: 15,
  });
}

export async function getSportsfunWalletTrades(
  address: string,
  params: SportsfunWalletListParams = {}
): Promise<TeneroCursorPage<SportsfunWalletTradeRow>> {
  return requestTenero<TeneroCursorPage<SportsfunWalletTradeRow>>({
    pathname: `/v1/sportsfun/wallets/${address}/trades`,
    params: {
      limit: params.limit,
      cursor: params.cursor,
    },
    cacheTtlSeconds: 15,
  });
}

export async function getSportsfunWalletTransfers(
  address: string,
  params: SportsfunWalletListParams = {}
): Promise<TeneroCursorPage<SportsfunWalletTransferRow>> {
  return requestTenero<TeneroCursorPage<SportsfunWalletTransferRow>>({
    pathname: `/v1/sportsfun/wallets/${address}/transfers`,
    params: {
      limit: params.limit,
      cursor: params.cursor,
    },
    cacheTtlSeconds: 15,
  });
}

export async function getSportsfunWalletPnlDistribution(
  address: string
): Promise<SportsfunWalletPnlDistribution | null> {
  try {
    return await requestTenero<SportsfunWalletPnlDistribution>({
      pathname: `/v1/sportsfun/wallets/${address}/pnl_distribution`,
      cacheTtlSeconds: 15,
    });
  } catch (error: unknown) {
    if (isTeneroRequestError(error) && error.statusCode >= 500) {
      return null;
    }
    throw error;
  }
}

export async function getSportsfunTrackedWallets(): Promise<SportsfunAuthGateResult<unknown>> {
  return requestAuthGated<unknown>("/v1/sportsfun/tracked_wallets");
}

export async function getSportsfunPortfolioWallets(): Promise<SportsfunAuthGateResult<unknown>> {
  return requestAuthGated<unknown>("/v1/sportsfun/portfolio_wallets");
}

export async function getSportsfunWalletRemarks(): Promise<SportsfunAuthGateResult<unknown>> {
  return requestAuthGated<unknown>("/v1/sportsfun/wallet_remarks");
}

export const teneroSportsfunConfig = {
  baseUrl: getTeneroBaseUrl(),
  requestTimeoutMs: REQUEST_TIMEOUT_MS,
  // For quick debug pages we expose current auth config check.
  hasCustomBaseUrl: Boolean(env.TENERO_API_BASE_URL?.trim()),
  allowSignedTls: parseBoolean(process.env.NODE_TLS_REJECT_UNAUTHORIZED),
} as const;
