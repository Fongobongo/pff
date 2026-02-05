import { NextResponse } from "next/server";
import { z } from "zod";
import { buildStatsBombMatchStats, getCompetitionTierById, getStatsBombMatches } from "@/lib/stats/statsbomb";
import { scoreFootball } from "@/lib/stats/football";
import { getCached, setCached } from "@/lib/stats/cache";
import { completeJob, createJob, failJob, getJobByKey, updateJob } from "@/lib/stats/jobs";
import { toCsv } from "@/lib/stats/csv";
import type { FootballCompetitionTier } from "@/lib/stats/types";

const querySchema = z.object({
  competition_id: z.coerce.number().int().min(1),
  season_id: z.coerce.number().int().min(1),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  top: z.coerce.number().int().min(1).max(200).optional(),
  refresh: z.coerce.boolean().optional(),
  format: z.enum(["json", "csv"]).optional(),
  mode: z.enum(["sync", "async"]).optional(),
});

type TournamentSummaryPlayer = {
  playerId: number;
  playerName: string;
  teamName: string;
  position: string;
  games: number;
  totalPoints: number;
  totalRounded: number;
  average: number;
};

type TournamentSummary = {
  sport: "football";
  source: "statsbomb_open_data";
  competitionId: number;
  seasonId: number;
  competitionTier?: FootballCompetitionTier;
  matchesProcessed: number;
  players: TournamentSummaryPlayer[];
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

async function buildTournamentSummary(options: {
  competitionId: number;
  seasonId: number;
  matches: Array<{ match_id: number; match_date?: string }>;
  competitionTier?: FootballCompetitionTier;
  topCount: number;
  refresh?: boolean;
  onProgress?: (processed: number, total: number) => void;
}): Promise<TournamentSummary> {
  const { competitionId, seasonId, matches, competitionTier, topCount, refresh, onProgress } = options;

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

  let processed = 0;
  const total = matches.length;

  await mapWithConcurrency(matches, 2, async (match) => {
    const stats = await buildStatsBombMatchStats({
      matchId: match.match_id,
      competitionId,
      seasonId,
      refresh,
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

    processed += 1;
    onProgress?.(processed, total);
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
    competitionId,
    seasonId,
    competitionTier,
    matchesProcessed: matches.length,
    players,
  };
}

function summaryToCsv(summary: TournamentSummary): string {
  const headers = [
    "player_id",
    "player_name",
    "team",
    "position",
    "games",
    "total_points",
    "total_rounded",
    "average",
  ];

  const rows = summary.players.map((player) => [
    player.playerId,
    player.playerName,
    player.teamName,
    player.position,
    player.games,
    player.totalPoints,
    player.totalRounded,
    player.average,
  ]);

  return toCsv(headers, rows);
}

function respondSummary(summary: TournamentSummary, format: "json" | "csv") {
  if (format === "csv") {
    const csv = summaryToCsv(summary);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tournament-summary-${summary.competitionId}-${summary.seasonId}.csv"`,
      },
    });
  }
  return NextResponse.json(summary);
}

async function runTournamentSummaryJob(options: {
  jobId: string;
  cacheKey: string;
  competitionId: number;
  seasonId: number;
  matches: Array<{ match_id: number; match_date?: string }>;
  competitionTier?: FootballCompetitionTier;
  topCount: number;
  refresh?: boolean;
}) {
  const { jobId, cacheKey, competitionId, seasonId, matches, competitionTier, topCount } = options;
  await updateJob(jobId, { status: "running", total: matches.length, processed: 0 });
  try {
    const summary = await buildTournamentSummary({
      competitionId,
      seasonId,
      matches,
      competitionTier,
      topCount,
      refresh: options.refresh,
      onProgress: (processed) => {
        void updateJob(jobId, { processed });
      },
    });
    setCached(cacheKey, summary, 3600);
    await completeJob(jobId, summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await failJob(jobId, message);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = querySchema.parse({
    competition_id: url.searchParams.get("competition_id"),
    season_id: url.searchParams.get("season_id"),
    limit: url.searchParams.get("limit") ?? undefined,
    top: url.searchParams.get("top") ?? undefined,
    refresh: url.searchParams.get("refresh") ?? undefined,
    format: url.searchParams.get("format") ?? undefined,
    mode: url.searchParams.get("mode") ?? undefined,
  });

  const cacheKey = `statsbomb:tournament-summary:${query.competition_id}:${query.season_id}:${
    query.limit ?? "all"
  }:${query.top ?? "50"}`;

  const format = query.format ?? "json";
  const cached = query.refresh ? undefined : getCached<TournamentSummary>(cacheKey);
  if (cached) {
    return respondSummary(cached, format);
  }

  const competitionTier = await getCompetitionTierById(query.competition_id);
  const matches = await getStatsBombMatches(query.competition_id, query.season_id);
  const ordered = [...matches].sort((a, b) => {
    const aDate = a.match_date ?? "";
    const bDate = b.match_date ?? "";
    return aDate.localeCompare(bDate);
  });

  const limited = query.limit ? ordered.slice(0, query.limit) : ordered;
  const topCount = query.top ?? 50;
  const wantsAsync = query.mode === "async" || (!query.limit && query.mode !== "sync");

  if (wantsAsync && !query.limit) {
    const jobKeyBase = `statsbomb:tournament-summary-job:${query.competition_id}:${query.season_id}:${topCount}`;
    const jobKey = query.refresh ? `${jobKeyBase}:${Date.now()}` : jobKeyBase;
    const existingJob = await getJobByKey<TournamentSummary>(jobKey);
    const job = existingJob ?? (await createJob<TournamentSummary>(jobKey, limited.length));

    if (job.status === "completed" && job.result) {
      setCached(cacheKey, job.result, 3600);
      return respondSummary(job.result, format);
    }

    if (job.status === "pending") {
      void runTournamentSummaryJob({
        jobId: job.id,
        cacheKey,
        competitionId: query.competition_id,
        seasonId: query.season_id,
        matches: limited,
        competitionTier,
        topCount,
        refresh: query.refresh,
      });
    }

    if (format === "csv") {
      return NextResponse.json(
        {
          status: job.status,
          jobId: job.id,
          competitionId: query.competition_id,
          seasonId: query.season_id,
          matchesTotal: job.total ?? limited.length,
          matchesProcessed: job.processed ?? 0,
          message: "CSV not ready yet.",
        },
        { status: 202 }
      );
    }

    return NextResponse.json({
      status: job.status,
      jobId: job.id,
      competitionId: query.competition_id,
      seasonId: query.season_id,
      matchesTotal: job.total ?? limited.length,
      matchesProcessed: job.processed ?? 0,
      top: topCount,
    });
  }

  const summary = await buildTournamentSummary({
    competitionId: query.competition_id,
    seasonId: query.season_id,
    matches: limited,
    competitionTier,
    topCount,
    refresh: query.refresh,
  });
  setCached(cacheKey, summary, 3600);
  return respondSummary(summary, format);
}
