import { z } from "zod";

const envSchema = z.object({
  // Optional in early development when we want to run without a database.
  DATABASE_URL: z.string().min(1).optional(),

  // Supabase REST config (service role key recommended for server-side writes).
  SUPABASE_PROJECT_URL: z.string().url().optional(),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // Optional: default to the public Base RPC.
  BASE_RPC_URL: z.string().url().optional(),

  // Etherscan API v2 key (note: free-tier may not cover Base mainnet).
  ETHERSCAN_API_KEY: z.string().min(1).optional(),

  // Alchemy key (free tier supported). Used for wallet history via Alchemy-specific RPC methods.
  ALCHEMY_API_KEY: z.string().min(1).optional(),

  // football-data.org API token (optional; free-tier has strict limits).
  FOOTBALL_DATA_API_KEY: z.string().min(1).optional(),

  // JSON overrides for football-data.org tier mapping (e.g. {"PL":"A","CL":"A"}).
  FOOTBALL_TIER_OVERRIDES: z.string().min(1).optional(),

  // StatsBomb storage mode: "hybrid" (default) or "db".
  STATSBOMB_STORAGE_MODE: z.string().min(1).optional(),

  // StatsBomb scoring concurrency (optional).
  STATSBOMB_SCORE_CONCURRENCY: z.coerce.number().int().min(1).max(6).optional(),

  // Enable external Sleeper projections in NFL projections API.
  SLEEPER_PROJECTIONS_ENABLED: z.string().optional(),

  // Optional JSON override for FUN reward tiers.
  FUN_REWARD_TIERS_JSON: z.string().optional(),

  // Optional fallback source for NFL token metadata enrichment.
  NFL_FUN_PLAYERS_DATA_URL: z.string().url().optional(),

  // Alert threshold for unresolved metadata share in NFL market API responses (0..100).
  NFL_MARKET_UNRESOLVED_ALERT_PCT: z.coerce.number().min(0).max(100).optional(),

  // Market alert sink config.
  MARKET_ALERT_SINK_MAX: z.coerce.number().int().min(50).max(2000).optional(),
  MARKET_ALERT_RETENTION_HOURS: z.coerce.number().int().min(1).max(24 * 365).optional(),

  // Admin token required for mutating market-alert operations.
  MARKET_ALERT_ADMIN_TOKEN: z.string().min(8).optional(),

  // External price sync (GeckoTerminal + DexScreener) for Sport.fun.
  SPORTFUN_PRICE_SYNC_ENABLED: z.string().optional(),
  SPORTFUN_PRICE_REFRESH_MINUTES: z.coerce.number().int().min(5).max(60).optional(),
  SPORTFUN_EXTERNAL_PRICE_TOKENS: z.string().optional(),

  // Optional Tenero API base URL override (defaults to public api.tenero.io).
  TENERO_API_BASE_URL: z.string().url().optional(),

  // Optional server-side auth token for Tenero auth-gated endpoints.
  TENERO_AUTH_BEARER_TOKEN: z.string().min(1).optional(),
});

const parsed = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  SUPABASE_PROJECT_URL: process.env.SUPABASE_PROJECT_URL,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  BASE_RPC_URL: process.env.BASE_RPC_URL,
  ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY,
  ALCHEMY_API_KEY: process.env.ALCHEMY_API_KEY,
  FOOTBALL_DATA_API_KEY: process.env.FOOTBALL_DATA_API_KEY,
  FOOTBALL_TIER_OVERRIDES: process.env.FOOTBALL_TIER_OVERRIDES,
  STATSBOMB_STORAGE_MODE: process.env.STATSBOMB_STORAGE_MODE,
  STATSBOMB_SCORE_CONCURRENCY: process.env.STATSBOMB_SCORE_CONCURRENCY,
  SLEEPER_PROJECTIONS_ENABLED: process.env.SLEEPER_PROJECTIONS_ENABLED,
  FUN_REWARD_TIERS_JSON: process.env.FUN_REWARD_TIERS_JSON,
  NFL_FUN_PLAYERS_DATA_URL: process.env.NFL_FUN_PLAYERS_DATA_URL,
  NFL_MARKET_UNRESOLVED_ALERT_PCT: process.env.NFL_MARKET_UNRESOLVED_ALERT_PCT,
  MARKET_ALERT_SINK_MAX: process.env.MARKET_ALERT_SINK_MAX,
  MARKET_ALERT_RETENTION_HOURS: process.env.MARKET_ALERT_RETENTION_HOURS,
  MARKET_ALERT_ADMIN_TOKEN: process.env.MARKET_ALERT_ADMIN_TOKEN,
  SPORTFUN_PRICE_SYNC_ENABLED: process.env.SPORTFUN_PRICE_SYNC_ENABLED,
  SPORTFUN_PRICE_REFRESH_MINUTES: process.env.SPORTFUN_PRICE_REFRESH_MINUTES,
  SPORTFUN_EXTERNAL_PRICE_TOKENS: process.env.SPORTFUN_EXTERNAL_PRICE_TOKENS,
  TENERO_API_BASE_URL: process.env.TENERO_API_BASE_URL,
  TENERO_AUTH_BEARER_TOKEN: process.env.TENERO_AUTH_BEARER_TOKEN,
});

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export const env = {
  ...parsed,
  BASE_RPC_URL: parsed.BASE_RPC_URL ?? "https://mainnet.base.org",
  SLEEPER_PROJECTIONS_ENABLED: parseBoolean(parsed.SLEEPER_PROJECTIONS_ENABLED),
  NFL_MARKET_UNRESOLVED_ALERT_PCT: parsed.NFL_MARKET_UNRESOLVED_ALERT_PCT ?? 25,
  MARKET_ALERT_SINK_MAX: parsed.MARKET_ALERT_SINK_MAX ?? 300,
  MARKET_ALERT_RETENTION_HOURS: parsed.MARKET_ALERT_RETENTION_HOURS ?? 24 * 7,
  MARKET_ALERT_ADMIN_TOKEN: parsed.MARKET_ALERT_ADMIN_TOKEN,
  SPORTFUN_PRICE_SYNC_ENABLED:
    parsed.SPORTFUN_PRICE_SYNC_ENABLED === undefined
      ? true
      : parseBoolean(parsed.SPORTFUN_PRICE_SYNC_ENABLED),
  SPORTFUN_PRICE_REFRESH_MINUTES: parsed.SPORTFUN_PRICE_REFRESH_MINUTES ?? 10,
  SUPABASE_SERVICE_ROLE_KEY: parsed.SUPABASE_SERVICE_ROLE_KEY ?? parsed.SUPABASE_SECRET_KEY,
};
