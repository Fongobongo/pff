import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchNflWeeklyStats } from "@/lib/stats/nflverse";
import { scoreNfl } from "@/lib/stats/nfl";

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
    week: url.searchParams.get("week"),
    season_type: url.searchParams.get("season_type") ?? undefined,
    player_id: url.searchParams.get("player_id") ?? undefined,
  });

  const data = await fetchNflWeeklyStats({
    season: query.season,
    week: query.week,
    seasonType: query.season_type,
    playerId: query.player_id,
  });

  const scoredRows = data.rows.map((row) => ({
    ...row,
    score: scoreNfl(row.stats),
  }));

  return NextResponse.json({
    sport: "nfl",
    season: data.season,
    week: data.week,
    seasonType: data.seasonType,
    sourceUrl: data.sourceUrl,
    coverage: data.coverage,
    rows: scoredRows,
  });
}
