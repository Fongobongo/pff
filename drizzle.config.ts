import type { Config } from "drizzle-kit";

// drizzle-kit config (note: this repo currently uses drizzle-kit v0.18.x)
// https://github.com/drizzle-team/drizzle-kit
export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  // For Postgres (e.g., Supabase), provide a standard connection string.
  connectionString: process.env.DATABASE_URL!,
} satisfies Config;
