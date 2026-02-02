import { NextResponse } from "next/server";
import { z } from "zod";
import { footballDataFetch } from "@/lib/footballdata";
import { resolveCompetitionTierFromFootballData } from "@/lib/footballTier";
import { buildStatsBombMatchStats, getStatsBombMatches, type StatsBombMatch } from "@/lib/stats/statsbomb";
import { scoreFootball } from "@/lib/stats/football";
import { findBestStatsBombMatch } from "@/lib/footballTeamMatch";

const querySchema = z.object({
  competition: z.string().min(1),
  season: z.coerce.number().int().min(1900).optional(),
  status: z.string().optional(),
  statsbomb_competition_id: z.coerce.number().int().min(1),
  statsbomb_season_id: z.coerce.number().int().min(1),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  include_scores: z.coerce.boolean().optional(),
});

type FixtureMatch = {
  id: number;
  utcDate?: string;
  status?: string;
  homeTeam?: { name?: string };
  awayTeam?: { name?: string };
  score?: { fullTime?: { home?: number | null; away?: number | null } };
};

type FootballDataMatchesResponse = {
  matches?: FixtureMatch[];
};

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}


function addDays(date: string, offset: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + offset);
  return parsed.toISOString().slice(0, 10);
}

function getCandidatesByDate(map: Map<string, StatsBombMatch[]>, date?: string): StatsBombMatch[] {
  if (!date) return [];
  const candidates = new Set<StatsBombMatch>();
  for (const key of [date, addDays(date, -1), addDays(date, 1)]) {
    for (const match of map.get(key) ?? []) {
      candidates.add(match);
    }
  }
  return Array.from(candidates);
}

function findBestMatch(
  fixture: FixtureMatch,
  candidates: StatsBombMatch[],
  fixtureDate?: string,
  competitionCode?: string
): {
  match?: StatsBombMatch;
  swapped: boolean;
  score: number;
  confidence?: "strong" | "fallback";
  reason?: string;
} {
  return findBestStatsBombMatch(
    fixture.homeTeam?.name,
    fixture.awayTeam?.name,
    candidates,
    fixtureDate,
    competitionCode
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = querySchema.parse({
    competition: url.searchParams.get("competition"),
    season: url.searchParams.get("season") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    statsbomb_competition_id: url.searchParams.get("statsbomb_competition_id"),
    statsbomb_season_id: url.searchParams.get("statsbomb_season_id"),
    limit: url.searchParams.get("limit") ?? undefined,
    include_scores: url.searchParams.get("include_scores") ?? undefined,
  });

  const data = await footballDataFetch<FootballDataMatchesResponse>(
    `/competitions/${query.competition}/matches`,
    {
      season: query.season,
      status: query.status,
    },
    300
  );

  const fixtures: FixtureMatch[] = data.matches ?? [];
  const limited = query.limit ? fixtures.slice(0, query.limit) : fixtures;

  const statsBombMatches = await getStatsBombMatches(
    query.statsbomb_competition_id,
    query.statsbomb_season_id
  );
  const statsBombByDate = new Map<string, StatsBombMatch[]>();
  for (const match of statsBombMatches) {
    if (!match.match_date) continue;
    const list = statsBombByDate.get(match.match_date) ?? [];
    list.push(match);
    statsBombByDate.set(match.match_date, list);
  }

  const competitionTier = resolveCompetitionTierFromFootballData(query.competition);

  const mapped = await mapWithConcurrency(limited, 2, async (fixture) => {
    const fixtureDate = fixture.utcDate?.slice(0, 10);
    const candidates = getCandidatesByDate(statsBombByDate, fixtureDate);
    const { match, swapped, score, confidence, reason } = findBestMatch(
      fixture,
      candidates,
      fixtureDate,
      query.competition
    );

    let scored: any = undefined;
    if (query.include_scores && match) {
      const stats = await buildStatsBombMatchStats({
        matchId: match.match_id,
        competitionId: query.statsbomb_competition_id,
        seasonId: query.statsbomb_season_id,
      });

      const players = stats.players.map((player) => ({
        ...player,
        score: scoreFootball(player.stats, {
          position: player.position,
          competitionTier,
          result: player.matchResult,
          minutesPlayed: player.minutesPlayed,
        }),
      }));

      scored = {
        matchId: match.match_id,
        teams: stats.teams,
        coverage: stats.coverage,
        players,
      };
    }

    return {
      fixtureId: fixture.id,
      fixtureDate,
      status: fixture.status,
      homeTeam: fixture.homeTeam?.name,
      awayTeam: fixture.awayTeam?.name,
      score: fixture.score?.fullTime ?? null,
      statsbombMatchId: match?.match_id ?? null,
      statsbombMatchDate: match?.match_date ?? null,
      matchSwapped: swapped,
      matchScore: score,
      matchConfidence: confidence ?? null,
      matchReason: reason ?? null,
      scoreFromMatchUrl: match
        ? `/api/stats/football/score-from-match?match_id=${match.match_id}&competition_id=${query.statsbomb_competition_id}&season_id=${query.statsbomb_season_id}`
        : null,
      scoreFromMatch: scored,
    };
  });

  const matchedCount = mapped.filter((item) => item.statsbombMatchId).length;

  return NextResponse.json({
    source: "football-data.org",
    competition: query.competition,
    season: query.season,
    statsbombCompetitionId: query.statsbomb_competition_id,
    statsbombSeasonId: query.statsbomb_season_id,
    competitionTier,
    totalFixtures: fixtures.length,
    returnedFixtures: mapped.length,
    matchedFixtures: matchedCount,
    unmatchedFixtures: mapped.length - matchedCount,
    fixtures: mapped,
  });
}
