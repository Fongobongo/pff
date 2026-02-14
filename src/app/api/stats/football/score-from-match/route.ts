import { NextResponse } from "next/server";
import { z } from "zod";
import { statsApiErrorResponse } from "@/lib/stats/apiError";
import { buildStatsBombMatchStats, getCompetitionTierById } from "@/lib/stats/statsbomb";
import { scoreFootball } from "@/lib/stats/football";
import { FOOTBALL_COMPETITION_TIERS } from "@/lib/stats/types";

const querySchema = z.object({
  match_id: z.coerce.number().int().min(1),
  competition_id: z.coerce.number().int().min(1).optional(),
  season_id: z.coerce.number().int().min(1).optional(),
  competition_tier: z.enum(FOOTBALL_COMPETITION_TIERS).optional(),
  big_match_bonus: z.coerce.number().finite().min(0).optional(),
  refresh: z.coerce.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = querySchema.parse({
      match_id: url.searchParams.get("match_id"),
      competition_id: url.searchParams.get("competition_id") ?? undefined,
      season_id: url.searchParams.get("season_id") ?? undefined,
      competition_tier: url.searchParams.get("competition_tier") ?? undefined,
      big_match_bonus: url.searchParams.get("big_match_bonus") ?? undefined,
      refresh: url.searchParams.get("refresh") ?? undefined,
    });

    const stats = await buildStatsBombMatchStats({
      matchId: query.match_id,
      competitionId: query.competition_id,
      seasonId: query.season_id,
      refresh: query.refresh,
    });

    const resolvedTier =
      query.competition_tier ??
      (query.competition_id ? await getCompetitionTierById(query.competition_id) : undefined);

    const players = stats.players.map((player) => {
      const result = scoreFootball(player.stats, {
        position: player.position,
        competitionTier: resolvedTier,
        result: player.matchResult,
        minutesPlayed: player.minutesPlayed,
        bigMatchBonus: query.big_match_bonus,
      });

      return {
        ...player,
        score: result,
      };
    });

    return NextResponse.json({
      sport: "football",
      source: "statsbomb_open_data",
      matchId: query.match_id,
      competitionId: query.competition_id,
      seasonId: query.season_id,
      competitionTier: resolvedTier,
      bigMatchBonus: query.big_match_bonus,
      teams: stats.teams,
      coverage: stats.coverage,
      players,
    });
  } catch (error) {
    return statsApiErrorResponse(error, "Failed to score match");
  }
}
