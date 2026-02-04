import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchNflWeeklyStats } from "@/lib/stats/nflverse";
import { scoreNfl } from "@/lib/stats/nfl";
import { getCached, setCached } from "@/lib/stats/cache";
import { completeJob, createJob, failJob, getJobByKey, updateJob } from "@/lib/stats/jobs";
import { toCsv } from "@/lib/stats/csv";

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

type MatrixRow = {
  playerId: string;
  playerName: string;
  team?: string;
  position?: string;
  games: number;
  totalPoints: number;
  totalRounded: number;
  average: number;
  weekScores: Array<number | null>;
};

type TournamentMatrix = {
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
  rows: MatrixRow[];
};

type SortConfig =
  | { kind: "total" }
  | { kind: "avg" }
  | { kind: "player" }
  | { kind: "team" }
  | { kind: "position" }
  | { kind: "week"; week: number };

function parseSort(sortRaw: string | undefined, weeks: number[]): SortConfig {
  if (!sortRaw) return { kind: "total" };
  if (sortRaw === "total") return { kind: "total" };
  if (sortRaw === "avg") return { kind: "avg" };
  if (sortRaw === "player") return { kind: "player" };
  if (sortRaw === "team") return { kind: "team" };
  if (sortRaw === "position") return { kind: "position" };
  if (sortRaw.startsWith("week_")) {
    const week = Number(sortRaw.slice(5));
    if (Number.isFinite(week) && weeks.includes(week)) {
      return { kind: "week", week };
    }
  }
  return { kind: "total" };
}

function sortRows(rows: MatrixRow[], weeks: number[], sort: SortConfig, dir: "asc" | "desc") {
  const multiplier = dir === "asc" ? 1 : -1;
  const nullValue = dir === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;

  const compareNumbers = (a: number | null | undefined, b: number | null | undefined) => {
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

  const weekIndex = sort.kind === "week" ? weeks.indexOf(sort.week) : -1;

  return rows.slice().sort((a, b) => {
    let cmp = 0;
    switch (sort.kind) {
      case "avg":
        cmp = compareNumbers(a.average, b.average);
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
      case "week":
        if (weekIndex >= 0) {
          cmp = compareNumbers(a.weekScores[weekIndex], b.weekScores[weekIndex]);
        }
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

function buildMatrix(options: {
  season: number;
  seasonType?: string;
  weekStart?: number;
  weekEnd?: number;
  weeks: number[];
  rows: Awaited<ReturnType<typeof fetchNflWeeklyStats>>["rows"];
  coverage: TournamentMatrix["coverage"];
  topCount: number;
  onProgress?: (processed: number, total: number) => void;
}): TournamentMatrix {
  const { season, seasonType, weekStart, weekEnd, weeks, rows, coverage, topCount, onProgress } = options;
  const playerMap = new Map<
    string,
    {
      playerId: string;
      playerName: string;
      team?: string;
      position?: string;
      games: number;
      totalPoints: number;
      totalRounded: number;
      scoresByWeek: Map<number, number>;
    }
  >();

  let processed = 0;
  let gamesTotal = 0;

  for (const row of rows) {
    const week = row.week;
    if (weekStart !== undefined && week < weekStart) continue;
    if (weekEnd !== undefined && week > weekEnd) continue;

    const score = scoreNfl(row.stats);
    gamesTotal += 1;
    const entry =
      playerMap.get(row.player_id) ??
      {
        playerId: row.player_id,
        playerName: row.player_display_name ?? row.player_name ?? row.player_id,
        team: row.team,
        position: row.position,
        games: 0,
        totalPoints: 0,
        totalRounded: 0,
        scoresByWeek: new Map<number, number>(),
      };

    entry.games += 1;
    entry.totalPoints += score.total;
    entry.totalRounded += score.totalRounded;
    entry.scoresByWeek.set(week, (entry.scoresByWeek.get(week) ?? 0) + (score.totalRounded ?? score.total));
    if (!entry.team && row.team) entry.team = row.team;
    if (!entry.position && row.position) entry.position = row.position;

    playerMap.set(row.player_id, entry);
    processed += 1;
    onProgress?.(processed, rows.length);
  }

  const players = Array.from(playerMap.values())
    .map((entry) => ({
      ...entry,
      average: entry.games > 0 ? entry.totalPoints / entry.games : 0,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, topCount);

  const rowsOut: MatrixRow[] = players.map((player) => ({
    playerId: player.playerId,
    playerName: player.playerName,
    team: player.team,
    position: player.position,
    games: player.games,
    totalPoints: player.totalPoints,
    totalRounded: player.totalRounded,
    average: player.average,
    weekScores: weeks.map((week) => {
      const val = player.scoresByWeek.get(week);
      return val === undefined ? null : Number(val.toFixed(2));
    }),
  }));

  return {
    sport: "nfl",
    source: "nflverse_data",
    season,
    seasonType,
    weekStart,
    weekEnd,
    weeks,
    playersTotal: playerMap.size,
    gamesTotal,
    coverage,
    rows: rowsOut,
  };
}

function respondMatrix(matrix: TournamentMatrix, format: "json" | "csv") {
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
      ...matrix.weeks.map((week) => `week_${week}`),
    ];
    const rows = matrix.rows.map((row) => [
      row.playerId,
      row.playerName,
      row.team ?? "",
      row.position ?? "",
      row.games,
      row.totalPoints,
      row.totalRounded,
      row.average,
      ...row.weekScores.map((val) => (val === null ? "" : val)),
    ]);
    const csv = toCsv(headers, rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="nfl-tournament-matrix-${matrix.season}.csv"`,
      },
    });
  }
  return NextResponse.json(matrix);
}

async function runMatrixJob(options: {
  jobId: string;
  cacheKey: string;
  season: number;
  seasonType?: string;
  weekStart?: number;
  weekEnd?: number;
  weeks: number[];
  rows: Awaited<ReturnType<typeof fetchNflWeeklyStats>>["rows"];
  coverage: TournamentMatrix["coverage"];
  topCount: number;
  sort: SortConfig;
  dir: "asc" | "desc";
}) {
  const { jobId, cacheKey, season, seasonType, weekStart, weekEnd, weeks, rows, coverage, topCount, sort, dir } = options;
  await updateJob(jobId, { status: "running", total: rows.length, processed: 0 });
  try {
    const matrix = buildMatrix({
      season,
      seasonType,
      weekStart,
      weekEnd,
      weeks,
      rows,
      coverage,
      topCount,
      onProgress: (processed) => {
        void updateJob(jobId, { processed });
      },
    });
    const sorted = { ...matrix, rows: sortRows(matrix.rows, weeks, sort, dir) };
    setCached(cacheKey, sorted, 3600);
    await completeJob(jobId, sorted);
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
  const dir = query.dir ?? "desc";

  const cacheKey = `nflverse:tournament-matrix:${query.season}:${query.season_type ?? "ALL"}:${
    query.week_start ?? "all"
  }:${query.week_end ?? "all"}:${topCount}:${query.sort ?? "total"}:${dir}`;

  const cached = query.refresh ? undefined : getCached<TournamentMatrix>(cacheKey);
  if (cached) {
    return respondMatrix(cached, format);
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
  const sort = parseSort(query.sort, weeks);

  const wantsAsync = query.mode === "async" || (query.week_start === undefined && query.week_end === undefined && query.mode !== "sync");

  if (wantsAsync && query.week_start === undefined && query.week_end === undefined) {
    const jobKeyBase = `nflverse:tournament-matrix-job:${query.season}:${query.season_type ?? "ALL"}:${topCount}:${
      query.sort ?? "total"
    }:${dir}`;
    const jobKey = query.refresh ? `${jobKeyBase}:${Date.now()}` : jobKeyBase;
    const existingJob = await getJobByKey<TournamentMatrix>(jobKey);
    const job = existingJob ?? (await createJob<TournamentMatrix>(jobKey, data.rows.length));

    if (job.status === "completed" && job.result) {
      setCached(cacheKey, job.result, 3600);
      return respondMatrix(job.result, format);
    }

    if (job.status === "pending") {
      void runMatrixJob({
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
      sort: query.sort ?? "total",
      dir,
    });
  }

  const matrix = buildMatrix({
    season: query.season,
    seasonType: query.season_type,
    weekStart,
    weekEnd,
    weeks,
    rows: data.rows,
    coverage: data.coverage,
    topCount,
  });

  const sorted = { ...matrix, rows: sortRows(matrix.rows, weeks, sort, dir) };
  setCached(cacheKey, sorted, 3600);
  if (format === "json") {
    return NextResponse.json({
      ...sorted,
      sort: query.sort ?? "total",
      dir,
    });
  }
  return respondMatrix(sorted, format);
}
