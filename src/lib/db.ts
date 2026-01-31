import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "@/lib/env";

// Database is optional in Phase 1 (free-tier / minimal dependencies).
// Call getDb() only when DATABASE_URL is configured.

let cached:
  | {
      pool: pg.Pool;
      db: ReturnType<typeof drizzle>;
    }
  | undefined;

export function getDb() {
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Configure it (e.g., Supabase Postgres) to enable DB-backed features."
    );
  }

  if (!cached) {
    const pool = new pg.Pool({
      connectionString: env.DATABASE_URL,
    });
    cached = { pool, db: drizzle(pool) };
  }

  return cached.db;
}
