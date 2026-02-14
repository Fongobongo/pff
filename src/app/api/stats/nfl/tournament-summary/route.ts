import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchNflWeeklyStats } from "@/lib/stats/nflverse";
import { scoreNfl } from "@/lib/stats/nfl";
import { getCached, setCached } from "@/lib/stats/cache";
import { completeJob, createJob, failJob, getJobByKey, updateJob } from "@/lib/stats/jobs";
import { toCsv } from "@/lib/stats/csv";
import { upsertSportfunTournamentTpRows } from "@/lib/sportfunTournamentTp";

const querySchema = z.object({
  season: z.coerce.number().int().min(1999),
  week_start: z.coerce.number().int().min(0).max(25).optional(),
  week_end: z.coerce.number().int().min(0).max(25).optional(),
  season_type: z.string().optional(),
  top: z.coerce.number().int().min(1).max(200).optional(),
  sort: z.string().optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  refresh: z.coerce.boolean().optional(),
  format: z.enum(["json", "csv"]).optional(),
  mode: z.enum(["sync", "async"]).optional(),
});

type SummaryPlayer = {
  playerId: string;
  playerName: string;
  team?: string;
  position?: string;
  games: number;
  totalPoints: number;
  totalRounded: number;
  average: number;
  bestWeek?: number;
  bestScore?: number;
  rank?: number;
};

type TournamentSummary = {
  sport: "nfl";
  source: "nflverse_data";
  season: number;
  seasonType?: string;
  weekStart?: number;
  weekEnd?: number;
  weeks: number[];
  playersTotal: number;
  gamesTotal: number;
  coverage: {
    mappedFields: string[];
    unmappedFields: string[];
    scoringMissing: string[];
  };
  sort?: string;
  dir?: "asc" | "desc";
  players: SummaryPlayer[];
};

type BuildSummaryResult = {
  summary: TournamentSummary;
  allPlayers: SummaryPlayer[];
};

function respondSummary(summary: TournamentSummary, format: "json" | "csv") {
  if (format === "csv") {
    const headers = [
      "player_id",
      "player_name",
      "team",
      "position",
      "games",
      "total_points",
      "total_rounded",
      "average",
      "best_week",
      "best_score",
    ];
    const rows = summary.players.map((player) => [
      player.playerId,
      player.playerName,
      player.team ?? "",
      player.position ?? "",
      player.games,
      player.totalPoints,
      player.totalRounded,
      player.average,
      player.bestWeek ?? "",
      player.bestScore ?? "",
    ]);
    const csv = toCsv(headers, rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="nfl-tournament-summary-${summary.season}.csv"`,
      },
    });
  }
  return NextResponse.json(summary);
}

type SummarySort =
  | "total"
  | "avg"
  | "best"
  | "player"
  | "team"
  | "position"
  | "games";

function parseSort(sortRaw: string | undefined): SummarySort {
  if (!sortRaw) return "total";
  if (
    sortRaw === "total" ||
    sortRaw === "avg" ||
    sortRaw === "best" ||
    sortRaw === "player" ||
    sortRaw === "team" ||
    sortRaw === "position" ||
    sortRaw === "games"
  ) {
    return sortRaw;
  }
  return "total";
}

function sortSummary(players: SummaryPlayer[], sort: SummarySort, dir: "asc" | "desc") {
  const multiplier = dir === "asc" ? 1 : -1;
  const nullValue = dir === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;

  const compareNumbers = (a: number | undefined, b: number | undefined) => {
    const left = a ?? nullValue;
    const right = b ?? nullValue;
    if (left === right) return 0;
    return left > right ? multiplier : -multiplier;
  };

  const compareStrings = (a: string | undefined, b: string | undefined) => {
    const left = (a ?? "").toLowerCase();
    const right = (b ?? "").toLowerCase();
    if (left === right) return 0;
    return left > right ? multiplier : -multiplier;
  };

  return players.slice().sort((a, b) => {
    let cmp = 0;
    switch (sort) {
      case "avg":
        cmp = compareNumbers(a.average, b.average);
        break;
      case "best":
        cmp = compareNumbers(a.bestScore, b.bestScore);
        break;
      case "player":
        cmp = compareStrings(a.playerName, b.playerName);
        break;
      case "team":
        cmp = compareStrings(a.team, b.team);
        break;
      case "position":
        cmp = compareStrings(a.position, b.position);
        break;
      case "games":
        cmp = compareNumbers(a.games, b.games);
        break;
      case "total":
      default:
        cmp = compareNumbers(a.totalRounded, b.totalRounded);
        break;
    }
    if (cmp !== 0) return cmp;
    return compareNumbers(a.totalRounded, b.totalRounded);
  });
}

function buildSummary(options: {
  season: number;
  seasonType?: string;
  weekStart?: number;
  weekEnd?: number;
  weeks: number[];
  rows: Awaited<ReturnType<typeof fetchNflWeeklyStats>>["rows"];
  coverage: TournamentSummary["coverage"];
  topCount: number;
  sort: SummarySort;
  dir: "asc" | "desc";
  onProgress?: (processed: number, total: number) => void;
}): BuildSummaryResult {
  const { season, seasonType, weekStart, weekEnd, weeks, rows, coverage, topCount, sort, dir, onProgress } = options;

  const playerTotals = new Map<string, Omit<SummaryPlayer, "average">>();
  let processed = 0;
  let gamesTotal = 0;

  for (const row of rows) {
    const week = row.week;
    if (weekStart !== undefined && week < weekStart) continue;
    if (weekEnd !== undefined && week > weekEnd) continue;

    const score = scoreNfl(row.stats);
    gamesTotal += 1;
    const existing = playerTotals.get(row.player_id);
    if (!existing) {
      playerTotals.set(row.player_id, {
        playerId: row.player_id,
        playerName: row.player_display_name ?? row.player_name ?? row.player_id,
        team: row.team,
        position: row.position,
        games: 1,
        totalPoints: score.total,
        totalRounded: score.totalRounded,
        bestWeek: row.week,
        bestScore: score.totalRounded ?? score.total,
      });
    } else {
      existing.games += 1;
      existing.totalPoints += score.total;
      existing.totalRounded += score.totalRounded;
      if (existing.bestScore === undefined || (score.totalRounded ?? score.total) > existing.bestScore) {
        existing.bestScore = score.totalRounded ?? score.total;
        existing.bestWeek = row.week;
      }
      if (!existing.team && row.team) existing.team = row.team;
      if (!existing.position && row.position) existing.position = row.position;
    }

    processed += 1;
    onProgress?.(processed, rows.length);
  }

  const players = Array.from(playerTotals.values())
    .map((player) => ({
      ...player,
      average: player.games > 0 ? player.totalPoints / player.games : 0,
    }))
    .slice();

  const rankedByTotal = sortSummary(players, "total", "desc").map((player, index) => ({
    ...player,
    rank: index + 1,
  }));

  const sorted = sortSummary(rankedByTotal, sort, dir).slice(0, topCount);

  return {
    summary: {
      sport: "nfl",
      source: "nflverse_data",
      season,
      seasonType,
      weekStart,
      weekEnd,
      weeks,
      playersTotal: playerTotals.size,
      gamesTotal,
      coverage,
      sort,
      dir,
      players: sorted,
    },
    allPlayers: rankedByTotal,
  };
}

async function persistNflTournamentTp(params: {
  season: number;
  seasonType?: string;
  weekStart?: number;
  weekEnd?: number;
  weeks: number[];
  gamesTotal: number;
  players: SummaryPlayer[];
}) {
  if (!params.players.length) return;
  const firstWeek = params.weekStart ?? params.weeks[0];
  const lastWeek = params.weekEnd ?? params.weeks[params.weeks.length - 1];
  const rangeKey = `${firstWeek ?? "all"}-${lastWeek ?? "all"}`;
  const tournamentKey = `nfl:${params.season}:${params.seasonType ?? "ALL"}:${rangeKey}`;
  const asOf = new Date().toISOString();

  await upsertSportfunTournamentTpRows(
    params.players.map((player) => ({
      sport: "nfl",
      tournamentKey,
      seasonId: params.season,
      seasonType: params.seasonType,
      weekStart: firstWeek,
      weekEnd: lastWeek,
      athleteId: player.playerId,
      athleteName: player.playerName,
      team: player.team,
      position: player.position,
      games: player.games,
      tpTotal: player.totalRounded,
      tpTotalUnrounded: player.totalPoints,
      tpAverage: player.average,
      rank: player.rank,
      source: "nflverse_data",
      asOf,
      providerPayload: {
        gamesTotal: params.gamesTotal,
        bestWeek: player.bestWeek ?? null,
        bestScore: player.bestScore ?? null,
      },
    }))
  );
}

async function runSummaryJob(options: {
  jobId: string;
  cacheKey: string;
  season: number;
  seasonType?: string;
  weekStart?: number;
  weekEnd?: number;
  weeks: number[];
  rows: Awaited<ReturnType<typeof fetchNflWeeklyStats>>["rows"];
  coverage: TournamentSummary["coverage"];
  topCount: number;
  sort: SummarySort;
  dir: "asc" | "desc";
  persistToSupabase?: boolean;
}) {
  const { jobId, cacheKey, season, seasonType, weekStart, weekEnd, weeks, rows, coverage, topCount, sort, dir } = options;
  await updateJob(jobId, { status: "running", total: rows.length, processed: 0 });
  try {
    const result = buildSummary({
      season,
      seasonType,
      weekStart,
      weekEnd,
      weeks,
      rows,
      coverage,
      topCount,
      sort,
      dir,
      onProgress: (processed) => {
        void updateJob(jobId, { processed });
      },
    });
    if (options.persistToSupabase) {
      await persistNflTournamentTp({
        season,
        seasonType,
        weekStart,
        weekEnd,
        weeks,
        gamesTotal: result.summary.gamesTotal,
        players: result.allPlayers,
      });
    }
    setCached(cacheKey, result.summary, 3600);
    await completeJob(jobId, result.summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await failJob(jobId, message);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = querySchema.parse({
    season: url.searchParams.get("season"),
    week_start: url.searchParams.get("week_start") ?? undefined,
    week_end: url.searchParams.get("week_end") ?? undefined,
    season_type: url.searchParams.get("season_type") ?? undefined,
    top: url.searchParams.get("top") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    dir: url.searchParams.get("dir") ?? undefined,
    refresh: url.searchParams.get("refresh") ?? undefined,
    format: url.searchParams.get("format") ?? undefined,
    mode: url.searchParams.get("mode") ?? undefined,
  });

  const format = query.format ?? "json";
  const topCount = query.top ?? 50;
  const sort = parseSort(query.sort);
  const dir = query.dir ?? "desc";

  const cacheKey = `nflverse:tournament-summary:${query.season}:${query.season_type ?? "ALL"}:${
    query.week_start ?? "all"
  }:${query.week_end ?? "all"}:${topCount}:${sort}:${dir}`;

  const cached = query.refresh ? undefined : getCached<TournamentSummary>(cacheKey);
  if (cached) {
    return respondSummary(cached, format);
  }

  const data = await fetchNflWeeklyStats({
    season: query.season,
    seasonType: query.season_type,
  });

  const allWeeks = Array.from(new Set(data.rows.map((row) => row.week))).sort((a, b) => a - b);
  const minWeek = allWeeks[0];
  const maxWeek = allWeeks[allWeeks.length - 1];
  let weekStart = query.week_start ?? minWeek;
  let weekEnd = query.week_end ?? maxWeek;
  if (weekStart !== undefined && weekEnd !== undefined && weekStart > weekEnd) {
    [weekStart, weekEnd] = [weekEnd, weekStart];
  }
  const weeks = allWeeks.filter(
    (week) => (weekStart === undefined || week >= weekStart) && (weekEnd === undefined || week <= weekEnd)
  );

  const wantsAsync = query.mode === "async" || (query.week_start === undefined && query.week_end === undefined && query.mode !== "sync");

  if (wantsAsync && query.week_start === undefined && query.week_end === undefined) {
    const jobKeyBase = `nflverse:tournament-summary-job:${query.season}:${query.season_type ?? "ALL"}:${topCount}:${sort}:${dir}`;
    const jobKey = query.refresh ? `${jobKeyBase}:${Date.now()}` : jobKeyBase;
    const existingJob = await getJobByKey<TournamentSummary>(jobKey);
    const job = existingJob ?? (await createJob<TournamentSummary>(jobKey, data.rows.length));

    if (job.status === "completed" && job.result) {
      setCached(cacheKey, job.result, 3600);
      return respondSummary(job.result, format);
    }

    if (job.status === "pending") {
      void runSummaryJob({
        jobId: job.id,
        cacheKey,
        season: query.season,
        seasonType: query.season_type,
        weekStart,
        weekEnd,
        weeks,
        rows: data.rows,
        coverage: data.coverage,
        topCount,
        sort,
        dir,
        persistToSupabase: true,
      });
    }

    if (format === "csv") {
      return NextResponse.json(
        {
          status: job.status,
          jobId: job.id,
          season: query.season,
          seasonType: query.season_type ?? null,
          gamesTotal: job.total ?? data.rows.length,
          gamesProcessed: job.processed ?? 0,
          message: "CSV not ready yet.",
        },
        { status: 202 }
      );
    }

    return NextResponse.json({
      status: job.status,
      jobId: job.id,
      season: query.season,
      seasonType: query.season_type ?? null,
      gamesTotal: job.total ?? data.rows.length,
      gamesProcessed: job.processed ?? 0,
      top: topCount,
      sort,
      dir,
    });
  }

  const result = buildSummary({
    season: query.season,
    seasonType: query.season_type,
    weekStart,
    weekEnd,
    weeks,
    rows: data.rows,
    coverage: data.coverage,
    topCount,
    sort,
    dir,
  });

  await persistNflTournamentTp({
    season: query.season,
    seasonType: query.season_type,
    weekStart,
    weekEnd,
    weeks,
    gamesTotal: result.summary.gamesTotal,
    players: result.allPlayers,
  });

  setCached(cacheKey, result.summary, 3600);
  if (format === "json") {
    return NextResponse.json(result.summary);
  }
  return respondSummary(result.summary, format);
}
