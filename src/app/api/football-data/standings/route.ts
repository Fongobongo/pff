import { NextResponse } from "next/server";
import { z } from "zod";
import { footballDataFetch } from "@/lib/footballdata";

const querySchema = z.object({
  competition: z.string().min(1),
  season: z.coerce.number().int().min(1900).optional(),
  matchday: z.coerce.number().int().min(1).optional(),
  date: z.string().optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = querySchema.parse({
    competition: url.searchParams.get("competition"),
    season: url.searchParams.get("season") ?? undefined,
    matchday: url.searchParams.get("matchday") ?? undefined,
    date: url.searchParams.get("date") ?? undefined,
  });

  const data = await footballDataFetch(
    `/competitions/${query.competition}/standings`,
    {
      season: query.season,
      matchday: query.matchday,
      date: query.date,
    },
    300
  );

  return NextResponse.json({
    source: "football-data.org",
    competition: query.competition,
    season: query.season,
    matchday: query.matchday,
    standings: data,
  });
}
