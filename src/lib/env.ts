import { z } from "zod";

const envSchema = z.object({
  // Optional in early development when we want to run without a database.
  DATABASE_URL: z.string().min(1).optional(),

  // Optional: default to the public Base RPC.
  BASE_RPC_URL: z.string().url().optional(),

  // Etherscan API v2 key (free tier is fine). Used for fast account history / token transfers on Base.
  ETHERSCAN_API_KEY: z.string().min(1).optional(),
});

const parsed = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  BASE_RPC_URL: process.env.BASE_RPC_URL,
  ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY,
});

export const env = {
  ...parsed,
  BASE_RPC_URL: parsed.BASE_RPC_URL ?? "https://mainnet.base.org",
};
