import { NextResponse } from "next/server";
import { z } from "zod";
import { footballDataFetch } from "@/lib/footballdata";
import { resolveCompetitionTierFromFootballData } from "@/lib/footballTier";

type FootballDataMatch = {
  id: number;
  utcDate?: string;
  status?: string;
  homeTeam?: { name?: string };
  awayTeam?: { name?: string };
  score?: { fullTime?: { home?: number | null; away?: number | null } };
};

type FootballDataMatchesResponse = {
  matches?: FootballDataMatch[];
};

const querySchema = z.object({
  competition: z.string().min(1),
  season: z.coerce.number().int().min(1900).optional(),
  matchday: z.coerce.number().int().min(1).optional(),
  status: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  stage: z.string().optional(),
  group: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce.number().int().min(1).max(200).optional(),
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
    page: url.searchParams.get("page") ?? undefined,
    page_size: url.searchParams.get("page_size") ?? undefined,
  });

  const data = await footballDataFetch<FootballDataMatchesResponse>(
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

  const tier = resolveCompetitionTierFromFootballData(query.competition);
  const allMatches = data.matches ?? [];
  const pageSize = query.page_size ?? allMatches.length;
  const page = query.page ?? 1;
  const offset = (page - 1) * pageSize;
  const paged = allMatches.slice(offset, offset + pageSize);

  return NextResponse.json({
    source: "football-data.org",
    competition: query.competition,
    season: query.season,
    matchday: query.matchday,
    competitionTier: tier,
    page,
    pageSize,
    totalMatches: allMatches.length,
    matches: data,
    pageMatches: paged,
  });
}
