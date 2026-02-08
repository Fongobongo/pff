import { NextResponse } from "next/server";
import { z } from "zod";
import { getSportfunMarketSnapshot } from "@/lib/sportfunMarket";
import { env } from "@/lib/env";
import { appendMarketAlert, isMarketAlertMuted } from "@/lib/marketAlertSink";

export const runtime = "nodejs";

const querySchema = z.object({
  sport: z.enum(["nfl", "soccer"]).default("nfl"),
  windowHours: z.string().optional(),
  trendDays: z.string().optional(),
  maxTokens: z.string().optional(),
});

function parseNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

const LOG_TTL_MS = 5 * 60 * 1000;
const logWindowByKey = new Map<string, number>();

function logOncePerWindow(key: string, message: string, ttlMs = LOG_TTL_MS): boolean {
  const now = Date.now();
  const until = logWindowByKey.get(key) ?? 0;
  if (now < until) return false;
  logWindowByKey.set(key, now + ttlMs);
  console.warn(message);
  return true;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = querySchema.parse({
    sport: searchParams.get("sport") ?? undefined,
    windowHours: searchParams.get("windowHours") ?? undefined,
    trendDays: searchParams.get("trendDays") ?? undefined,
    maxTokens: searchParams.get("maxTokens") ?? undefined,
  });

  const snapshot = await getSportfunMarketSnapshot({
    sport: query.sport,
    windowHours: parseNumber(query.windowHours, 24, 1, 168),
    trendDays: parseNumber(query.trendDays, 30, 7, 365),
    maxTokens: parseNumber(query.maxTokens, 250, 20, 1000),
  });

  const metadataSourceCounts = snapshot.stats?.metadataSourceCounts ?? {
    onchainOnly: 0,
    fallbackOnly: 0,
    hybrid: 0,
    overrideOnly: 0,
    unresolved: 0,
  };
  const fallbackFeed = snapshot.stats?.fallbackFeed ?? { source: "n/a", staleAgeMs: undefined };
  const totalTokens = snapshot.tokens.length;
  const unresolvedSharePct =
    totalTokens > 0 ? (metadataSourceCounts.unresolved / totalTokens) * 100 : 0;
  if (fallbackFeed.source === "stale_snapshot") {
    const muted = await isMarketAlertMuted({
      sport: query.sport,
      type: "fallback_stale_feed",
    });
    if (!muted) {
      const staleAge = fallbackFeed.staleAgeMs ?? -1;
      const emitted = logOncePerWindow(
        `market-fallback-stale:${query.sport}`,
        `[sportfun-market] stale fallback feed source=${query.sport} staleAgeMs=${staleAge} onchainOnly=${metadataSourceCounts.onchainOnly} fallbackOnly=${metadataSourceCounts.fallbackOnly} hybrid=${metadataSourceCounts.hybrid} unresolved=${metadataSourceCounts.unresolved}`
      );
      if (emitted) {
        void appendMarketAlert({
          sport: query.sport,
          type: "fallback_stale_feed",
          message: "Stale fallback feed source used for market metadata.",
          data: {
            staleAgeMs: staleAge,
            onchainOnly: metadataSourceCounts.onchainOnly,
            fallbackOnly: metadataSourceCounts.fallbackOnly,
            hybrid: metadataSourceCounts.hybrid,
            unresolved: metadataSourceCounts.unresolved,
            unresolvedSharePct: Number(unresolvedSharePct.toFixed(2)),
          },
        });
      }
    }
  }
  if (query.sport === "nfl" && totalTokens > 0 && unresolvedSharePct >= env.NFL_MARKET_UNRESOLVED_ALERT_PCT) {
    const muted = await isMarketAlertMuted({
      sport: query.sport,
      type: "unresolved_share_high",
    });
    if (!muted) {
      const emitted = logOncePerWindow(
        `market-unresolved-share:${query.sport}`,
        `[sportfun-market] unresolved metadata share high sport=${query.sport} unresolved=${metadataSourceCounts.unresolved}/${totalTokens} unresolvedPct=${unresolvedSharePct.toFixed(
          2
        )} thresholdPct=${env.NFL_MARKET_UNRESOLVED_ALERT_PCT} fallbackFeed=${fallbackFeed.source}`
      );
      if (emitted) {
        void appendMarketAlert({
          sport: query.sport,
          type: "unresolved_share_high",
          message: "Unresolved metadata share exceeded configured threshold.",
          data: {
            unresolved: metadataSourceCounts.unresolved,
            totalTokens,
            unresolvedSharePct: Number(unresolvedSharePct.toFixed(2)),
            thresholdPct: env.NFL_MARKET_UNRESOLVED_ALERT_PCT,
            fallbackFeed: fallbackFeed.source,
          },
        });
      }
    }
  }

  return NextResponse.json(snapshot, {
    headers: {
      "cache-control": "s-maxage=120, stale-while-revalidate=600",
      "x-market-meta-source-onchain": String(metadataSourceCounts.onchainOnly),
      "x-market-meta-source-fallback": String(metadataSourceCounts.fallbackOnly),
      "x-market-meta-source-hybrid": String(metadataSourceCounts.hybrid),
      "x-market-meta-source-override": String(metadataSourceCounts.overrideOnly),
      "x-market-meta-source-unresolved": String(metadataSourceCounts.unresolved),
      "x-market-fallback-feed-source": String(fallbackFeed.source),
      "x-market-fallback-feed-stale-age-ms":
        fallbackFeed.staleAgeMs !== undefined ? String(fallbackFeed.staleAgeMs) : "n/a",
      "x-market-unresolved-share-pct": unresolvedSharePct.toFixed(2),
      "x-market-unresolved-alert-threshold-pct": String(env.NFL_MARKET_UNRESOLVED_ALERT_PCT),
    },
  });
}
