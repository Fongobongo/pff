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

});

const parsed = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  BASE_RPC_URL: process.env.BASE_RPC_URL,
  ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY,
  ALCHEMY_API_KEY: process.env.ALCHEMY_API_KEY,
  FOOTBALL_DATA_API_KEY: process.env.FOOTBALL_DATA_API_KEY,
  FOOTBALL_TIER_OVERRIDES: process.env.FOOTBALL_TIER_OVERRIDES,
});

export const env = {
  ...parsed,
  BASE_RPC_URL: parsed.BASE_RPC_URL ?? "https://mainnet.base.org",
};
