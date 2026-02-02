import { NextResponse } from "next/server";
import { z } from "zod";
import { footballDataFetch } from "@/lib/footballdata";

const querySchema = z.object({
  competition: z.string().min(1),
  season: z.coerce.number().int().min(1900).optional(),
  matchday: z.coerce.number().int().min(1).optional(),
  status: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  stage: z.string().optional(),
  group: z.string().optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = querySchema.parse({
    competition: url.searchParams.get("competition"),
    season: url.searchParams.get("season") ?? undefined,
    matchday: url.searchParams.get("matchday") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    dateFrom: url.searchParams.get("dateFrom") ?? undefined,
    dateTo: url.searchParams.get("dateTo") ?? undefined,
    stage: url.searchParams.get("stage") ?? undefined,
    group: url.searchParams.get("group") ?? undefined,
  });

  const data = await footballDataFetch(
    `/competitions/${query.competition}/matches`,
    {
      season: query.season,
      matchday: query.matchday,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      stage: query.stage,
      group: query.group,
    },
    300
  );

  return NextResponse.json({
    source: "football-data.org",
    competition: query.competition,
    season: query.season,
    matchday: query.matchday,
    matches: data,
  });
}
