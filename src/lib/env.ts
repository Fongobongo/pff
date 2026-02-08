import { z } from "zod";

const envSchema = z.object({
  // Optional in early development when we want to run without a database.
  DATABASE_URL: z.string().min(1).optional(),

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
});

const parsed = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
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
};
