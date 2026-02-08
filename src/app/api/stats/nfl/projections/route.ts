import { NextResponse } from "next/server";
import { z } from "zod";
import { getNflProjections, type NflProjectionQuerySource } from "@/lib/stats/nflProjections";

const querySchema = z.object({
  season: z.coerce.number().int().min(1999),
  week: z.coerce.number().int().min(1).max(25),
  season_type: z.string().optional(),
  player_ids: z.string().optional(),
  source: z.enum(["auto", "sleeper", "fallback"]).optional(),
});

function parsePlayerIds(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length ? values : undefined;
}

const LOG_TTL_MS = 5 * 60 * 1000;
const logWindowByKey = new Map<string, number>();

function logOncePerWindow(key: string, message: string, ttlMs = LOG_TTL_MS) {
  const now = Date.now();
  const until = logWindowByKey.get(key) ?? 0;
  if (now < until) return;
  logWindowByKey.set(key, now + ttlMs);
  console.warn(message);
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const url = new URL(request.url);
  const query = querySchema.parse({
    season: url.searchParams.get("season"),
    week: url.searchParams.get("week"),
    season_type: url.searchParams.get("season_type") ?? undefined,
    player_ids: url.searchParams.get("player_ids") ?? undefined,
    source: url.searchParams.get("source") ?? undefined,
  });

  const source = (query.source ?? "auto") as NflProjectionQuerySource;
  const rows = await getNflProjections({
    season: query.season,
    week: query.week,
    seasonType: query.season_type,
    playerIds: parsePlayerIds(query.player_ids),
    source,
  });

  const sourceCounts = rows.reduce(
    (acc, row) => {
      if (row.source === "sleeper") {
        acc.sleeper += 1;
      } else {
        acc.fallback += 1;
      }
      return acc;
    },
    { sleeper: 0, fallback: 0 }
  );

  const total = rows.length || 1;
  const fallbackRatio = sourceCounts.fallback / total;
  const elapsedMs = Date.now() - startedAt;

  if (source !== "fallback" && fallbackRatio >= 0.9 && sourceCounts.fallback >= 200) {
    logOncePerWindow(
      `fallback-high:${query.season}:${query.week}:${(query.season_type ?? "REG").toUpperCase()}`,
      `[nfl-projections] high fallback ratio=${(fallbackRatio * 100).toFixed(1)}% season=${query.season} week=${query.week} seasonType=${(query.season_type ?? "REG").toUpperCase()} source=${source} sleeper=${sourceCounts.sleeper} fallback=${sourceCounts.fallback} latencyMs=${elapsedMs}`
    );
  }

  return NextResponse.json(
    {
      sport: "nfl",
      season: query.season,
      week: query.week,
      seasonType: (query.season_type ?? "REG").toUpperCase(),
      source,
      stats: {
        latencyMs: elapsedMs,
        sourceCounts,
        fallbackRatio,
      },
      rows,
    },
    {
      headers: {
        "cache-control": "s-maxage=120, stale-while-revalidate=600",
        "x-projections-latency-ms": String(elapsedMs),
        "x-projections-fallback-ratio": fallbackRatio.toFixed(4),
        "x-projections-source-sleeper": String(sourceCounts.sleeper),
        "x-projections-source-fallback": String(sourceCounts.fallback),
      },
    }
  );
}
