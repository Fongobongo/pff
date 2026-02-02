import { NextResponse } from "next/server";
import { z } from "zod";
import { buildStatsBombMatchStats, getCompetitionTierById, getStatsBombMatches } from "@/lib/stats/statsbomb";
import { scoreFootball } from "@/lib/stats/football";
import { setCached, withCache } from "@/lib/stats/cache";

const querySchema = z.object({
  competition_id: z.coerce.number().int().min(1),
  season_id: z.coerce.number().int().min(1),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  top: z.coerce.number().int().min(1).max(200).optional(),
  refresh: z.coerce.boolean().optional(),
});

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
  const url = new URL(request.url);
  const query = querySchema.parse({
    competition_id: url.searchParams.get("competition_id"),
    season_id: url.searchParams.get("season_id"),
    limit: url.searchParams.get("limit") ?? undefined,
    top: url.searchParams.get("top") ?? undefined,
    refresh: url.searchParams.get("refresh") ?? undefined,
  });

  const cacheKey = `statsbomb:tournament-summary:${query.competition_id}:${query.season_id}:${
    query.limit ?? "all"
  }:${query.top ?? "50"}`;

  const loader = async () => {
    const competitionTier = await getCompetitionTierById(query.competition_id);
    const matches = await getStatsBombMatches(query.competition_id, query.season_id);
    const ordered = [...matches].sort((a, b) => {
      const aDate = a.match_date ?? "";
      const bDate = b.match_date ?? "";
      return aDate.localeCompare(bDate);
    });

    const limited = query.limit ? ordered.slice(0, query.limit) : ordered;
    const topCount = query.top ?? 50;

    const playerTotals = new Map<
      number,
      {
        playerId: number;
        playerName: string;
        teamName: string;
        position: string;
        games: number;
        totalPoints: number;
        totalRounded: number;
      }
    >();

    await mapWithConcurrency(limited, 2, async (match) => {
      const stats = await buildStatsBombMatchStats({
        matchId: match.match_id,
        competitionId: query.competition_id,
        seasonId: query.season_id,
      });

      for (const player of stats.players) {
        const score = scoreFootball(player.stats, {
          position: player.position,
          competitionTier,
          result: player.matchResult,
          minutesPlayed: player.minutesPlayed,
        });

        const existing = playerTotals.get(player.playerId);
        if (!existing) {
          playerTotals.set(player.playerId, {
            playerId: player.playerId,
            playerName: player.playerName,
            teamName: player.teamName,
            position: player.position,
            games: 1,
            totalPoints: score.total,
            totalRounded: score.totalRounded,
          });
        } else {
          existing.games += 1;
          existing.totalPoints += score.total;
          existing.totalRounded += score.totalRounded;
          if (!existing.teamName && player.teamName) existing.teamName = player.teamName;
          if (!existing.position && player.position) existing.position = player.position;
        }
      }

      return match.match_id;
    });

    const players = Array.from(playerTotals.values())
      .map((player) => ({
        ...player,
        average: player.games > 0 ? player.totalPoints / player.games : 0,
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, topCount);

    return {
      sport: "football",
      source: "statsbomb_open_data",
      competitionId: query.competition_id,
      seasonId: query.season_id,
      competitionTier,
      matchesProcessed: limited.length,
      players,
    };
  };

  if (query.refresh) {
    const fresh = await loader();
    setCached(cacheKey, fresh, 3600);
    return NextResponse.json(fresh);
  }

  const cached = await withCache(cacheKey, 3600, loader);
  return NextResponse.json(cached);
}
