// Database schema lives here.
// Keep it minimal until we confirm which entities we need to persist.

import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const example = pgTable("example", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
