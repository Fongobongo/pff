import { NextResponse } from "next/server";
import { z } from "zod";
import { statsApiErrorResponse } from "@/lib/stats/apiError";
import { buildStatsBombMatchStats, getCompetitionTierById, getStatsBombMatches } from "@/lib/stats/statsbomb";
import { scoreFootball } from "@/lib/stats/football";
import { getCached, setCached } from "@/lib/stats/cache";
import { env } from "@/lib/env";

const querySchema = z.object({
  competition_id: z.coerce.number().int().min(1),
  season_id: z.coerce.number().int().min(1),
  limit: z.coerce.number().int().min(1).max(400).optional(),
  include_players: z.coerce.boolean().optional(),
  recent: z.coerce.boolean().optional(),
  refresh: z.coerce.boolean().optional(),
});

const SCORE_COMPETITION_CACHE_TTL_SECONDS = 60 * 60;
const SCORE_COMPETITION_CONCURRENCY = Math.max(
  1,
  Math.min(6, env.STATSBOMB_SCORE_CONCURRENCY ?? 2)
);

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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = querySchema.parse({
      competition_id: url.searchParams.get("competition_id"),
      season_id: url.searchParams.get("season_id"),
      limit: url.searchParams.get("limit") ?? undefined,
      include_players: url.searchParams.get("include_players") ?? undefined,
      recent: url.searchParams.get("recent") ?? undefined,
      refresh: url.searchParams.get("refresh") ?? undefined,
    });

    const includePlayers = query.include_players ?? true;
    const cacheKey = `statsbomb:score-competition:${query.competition_id}:${query.season_id}:${
      query.limit ?? "all"
    }:${query.recent ? "recent" : "all"}:${includePlayers ? "players" : "teams"}`;

    if (!query.refresh) {
      const cached = getCached<ScoreCompetitionResponse>(cacheKey);
      if (cached) return NextResponse.json(cached);
    }

    const competitionTier = await getCompetitionTierById(query.competition_id);
    const matches = await getStatsBombMatches(query.competition_id, query.season_id);
    const ordered = [...matches].sort((a, b) => {
      const aDate = a.match_date ?? "";
      const bDate = b.match_date ?? "";
      return aDate.localeCompare(bDate);
    });

    const limited = query.limit
      ? query.recent
        ? ordered.slice(-query.limit)
        : ordered.slice(0, query.limit)
      : ordered;

    const scored = await mapWithConcurrency(limited, SCORE_COMPETITION_CONCURRENCY, async (match) => {
      const stats = await buildStatsBombMatchStats({
        matchId: match.match_id,
        competitionId: query.competition_id,
        seasonId: query.season_id,
        refresh: query.refresh,
      });

      const players = includePlayers
        ? stats.players.map((player) => ({
            ...player,
            score: scoreFootball(player.stats, {
              position: player.position,
              competitionTier,
              result: player.matchResult,
              minutesPlayed: player.minutesPlayed,
            }),
          }))
        : [];

      return {
        matchId: match.match_id,
        matchDate: match.match_date,
        homeTeam: match.home_team?.home_team_name,
        awayTeam: match.away_team?.away_team_name,
        homeScore: match.home_score,
        awayScore: match.away_score,
        players,
        coverage: stats.coverage,
      };
    });

    const response: ScoreCompetitionResponse = {
      sport: "football",
      source: "statsbomb_open_data",
      competitionId: query.competition_id,
      seasonId: query.season_id,
      competitionTier,
      matchCount: limited.length,
      matches: scored,
    };

    setCached(cacheKey, response, SCORE_COMPETITION_CACHE_TTL_SECONDS);
    return NextResponse.json(response);
  } catch (error) {
    return statsApiErrorResponse(error, "Failed to score competition");
  }
}

type ScoreCompetitionResponse = {
  sport: "football";
  source: "statsbomb_open_data";
  competitionId: number;
  seasonId: number;
  competitionTier?: Awaited<ReturnType<typeof getCompetitionTierById>>;
  matchCount: number;
  matches: Array<{
    matchId: number;
    matchDate?: string;
    homeTeam?: string;
    awayTeam?: string;
    homeScore?: number;
    awayScore?: number;
    players: Array<{
      playerId: number;
      playerName: string;
      teamName?: string;
      position?: string;
      minutesPlayed?: number;
      matchResult?: string;
      stats?: Record<string, number>;
      xg?: number;
      xa?: number;
      score?: { total?: number; totalRounded?: number };
    }>;
    coverage: unknown;
  }>;
};
