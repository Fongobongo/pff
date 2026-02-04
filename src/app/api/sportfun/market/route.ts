import { NextResponse } from "next/server";
import { z } from "zod";
import { getSportfunMarketSnapshot } from "@/lib/sportfunMarket";

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

  return NextResponse.json(snapshot, {
    headers: { "cache-control": "s-maxage=120, stale-while-revalidate=600" },
  });
}
