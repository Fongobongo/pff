import { NextResponse } from "next/server";
import { z } from "zod";
import { footballDataFetch } from "@/lib/footballdata";
import { resolveCompetitionTierFromFootballData } from "@/lib/footballTier";
import { statsApiErrorResponse } from "@/lib/stats/apiError";

type FootballDataStandingsRow = {
  position?: number;
  team?: { name?: string };
  playedGames?: number;
  won?: number;
  draw?: number;
  lost?: number;
  points?: number;
  goalsFor?: number;
  goalsAgainst?: number;
  goalDifference?: number;
};

type FootballDataStandingsEntry = {
  type?: string;
  table?: FootballDataStandingsRow[];
};

type FootballDataStandingsResponse = {
  standings?: FootballDataStandingsEntry[];
};

const querySchema = z.object({
  competition: z.string().min(1).optional(),
  competition_id: z.string().min(1).optional(),
  season: z.coerce.number().int().min(1900).optional(),
  matchday: z.coerce.number().int().min(1).optional(),
  date: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce.number().int().min(1).max(200).optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = querySchema.parse({
      competition: url.searchParams.get("competition") ?? undefined,
      competition_id: url.searchParams.get("competition_id") ?? undefined,
      season: url.searchParams.get("season") ?? undefined,
      matchday: url.searchParams.get("matchday") ?? undefined,
      date: url.searchParams.get("date") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      page_size: url.searchParams.get("page_size") ?? undefined,
    });

    const competition = query.competition ?? query.competition_id;
    if (!competition) {
      return NextResponse.json(
        {
          error: "invalid_query",
          message: "Provide `competition` (or legacy `competition_id`) query parameter.",
        },
        { status: 400 }
      );
    }

    const data = await footballDataFetch<FootballDataStandingsResponse>(
      `/competitions/${competition}/standings`,
      {
        season: query.season,
        matchday: query.matchday,
        date: query.date,
      },
      300
    );

    const tier = resolveCompetitionTierFromFootballData(competition);
    const table =
      data.standings?.find((item: FootballDataStandingsEntry) => item.type === "TOTAL") ??
      data.standings?.[0];
    const rows = table?.table ?? [];
    const pageSize = query.page_size ?? rows.length;
    const page = query.page ?? 1;
    const offset = (page - 1) * pageSize;
    const paged = rows.slice(offset, offset + pageSize);

    return NextResponse.json({
      source: "football-data.org",
      competition,
      season: query.season,
      matchday: query.matchday,
      competitionTier: tier,
      page,
      pageSize,
      totalTeams: rows.length,
      standings: data,
      table: paged,
    });
  } catch (error) {
    return statsApiErrorResponse(error, "Failed to fetch football-data standings");
  }
}
