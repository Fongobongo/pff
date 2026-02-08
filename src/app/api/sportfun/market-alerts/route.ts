import { NextResponse } from "next/server";
import { z } from "zod";
import { getMarketAlerts, type MarketAlertSport, type MarketAlertType } from "@/lib/marketAlertSink";

export const runtime = "nodejs";

const querySchema = z.object({
  limit: z.string().optional(),
  sport: z.enum(["nfl", "soccer"]).optional(),
  type: z.enum(["fallback_stale_feed", "unresolved_share_high"]).optional(),
});

function parseLimit(value: string | undefined): number {
  const fallback = 50;
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, Math.trunc(parsed)));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = querySchema.parse({
    limit: searchParams.get("limit") ?? undefined,
    sport: searchParams.get("sport") ?? undefined,
    type: searchParams.get("type") ?? undefined,
  });

  const payload = await getMarketAlerts({
    limit: parseLimit(query.limit),
    sport: query.sport as MarketAlertSport | undefined,
    type: query.type as MarketAlertType | undefined,
  });

  return NextResponse.json(payload, {
    headers: {
      "cache-control": "no-store",
    },
  });
}
