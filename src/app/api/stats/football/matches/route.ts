import { NextResponse } from "next/server";
import { z } from "zod";
import { statsApiErrorResponse } from "@/lib/stats/apiError";
import { getStatsBombMatches } from "@/lib/stats/statsbomb";

const querySchema = z.object({
  competition_id: z.coerce.number().int().min(1),
  season_id: z.coerce.number().int().min(1),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = querySchema.parse({
      competition_id: url.searchParams.get("competition_id"),
      season_id: url.searchParams.get("season_id"),
    });

    const matches = await getStatsBombMatches(query.competition_id, query.season_id);

    return NextResponse.json({
      sport: "football",
      source: "statsbomb_open_data",
      competitionId: query.competition_id,
      seasonId: query.season_id,
      matches,
    });
  } catch (error) {
    return statsApiErrorResponse(error, "Failed to fetch matches");
  }
}
