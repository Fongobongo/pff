import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BASE_RPC_URL: z.string().url(),

  // Etherscan API v2 key (free tier is fine). Used for fast account history / token transfers on Base.
  ETHERSCAN_API_KEY: z.string().min(1).optional(),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  BASE_RPC_URL: process.env.BASE_RPC_URL,
  ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY,
});
