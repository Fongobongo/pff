import { NextResponse } from "next/server";
import { z } from "zod";
import { buildStatsBombMatchStats } from "@/lib/stats/statsbomb";

const querySchema = z.object({
  match_id: z.coerce.number().int().min(1),
  competition_id: z.coerce.number().int().min(1).optional(),
  season_id: z.coerce.number().int().min(1).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = querySchema.parse({
    match_id: url.searchParams.get("match_id"),
    competition_id: url.searchParams.get("competition_id") ?? undefined,
    season_id: url.searchParams.get("season_id") ?? undefined,
  });

  const stats = await buildStatsBombMatchStats({
    matchId: query.match_id,
    competitionId: query.competition_id,
    seasonId: query.season_id,
  });

  return NextResponse.json({
    sport: "football",
    source: "statsbomb_open_data",
    ...stats,
  });
}
