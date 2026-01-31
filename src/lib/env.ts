import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BASE_RPC_URL: z.string().url(),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  BASE_RPC_URL: process.env.BASE_RPC_URL,
});
