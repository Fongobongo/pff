import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchNflWeeklyStats } from "@/lib/stats/nflverse";

const querySchema = z.object({
  season: z.coerce.number().int().min(1999),
  week: z.coerce.number().int().min(1).max(25).optional(),
  season_type: z.string().optional(),
  player_id: z.string().optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = querySchema.parse({
    season: url.searchParams.get("season"),
    week: url.searchParams.get("week") ?? undefined,
    season_type: url.searchParams.get("season_type") ?? undefined,
    player_id: url.searchParams.get("player_id") ?? undefined,
  });

  const data = await fetchNflWeeklyStats({
    season: query.season,
    week: query.week,
    seasonType: query.season_type,
    playerId: query.player_id,
  });

  return NextResponse.json({
    sport: "nfl",
    ...data,
  });
}
