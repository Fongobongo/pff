// Database schema lives here.
// Keep it minimal until we confirm which entities we need to persist.

import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const example = pgTable("example", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const statsJobs = pgTable(
  "stats_jobs",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    total: integer("total"),
    processed: integer("processed"),
    error: text("error"),
    result: jsonb("result"),
  },
  (table) => ({
    keyIndex: uniqueIndex("stats_jobs_key_idx").on(table.key),
  })
);

export const statsbombMatchStats = pgTable("statsbomb_match_stats", {
  matchId: integer("match_id").primaryKey(),
  competitionId: integer("competition_id"),
  seasonId: integer("season_id"),
  matchDate: text("match_date"),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
