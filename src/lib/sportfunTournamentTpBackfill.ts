import { scoreFootball } from "@/lib/stats/football";
import { scoreNfl } from "@/lib/stats/nfl";
import { fetchNflWeeklyStats } from "@/lib/stats/nflverse";
import {
  buildStatsBombMatchStats,
  getCompetitionTierById,
  getStatsBombCompetitions,
  getStatsBombMatches,
  type StatsBombCompetition,
} from "@/lib/stats/statsbomb";
import type { FootballCompetitionTier } from "@/lib/stats/types";
import {
  upsertSportfunTournamentTpRows,
  type SportfunTournamentTpUpsertRow,
} from "@/lib/sportfunTournamentTp";

const DEFAULT_BACKFILL_START_YEAR = 2024;
const DEFAULT_NFL_SEASON_TYPES = ["REG", "POST"] as const;

type NflBackfillJob = {
  sport: "nfl";
  season: number;
  seasonType: string;
  key: string;
};

type FootballBackfillJob = {
  sport: "football";
  competitionId: number;
  seasonId: number;
  competitionName: string;
  seasonName: string;
  seasonYear: number;
  key: string;
};

type BackfillJob = NflBackfillJob | FootballBackfillJob;

export type SportfunTournamentTpBackfillOptions = {
  fromYear?: number;
  toYear?: number;
  includeNfl?: boolean;
  includeFootball?: boolean;
  nflSeasonTypes?: string[];
  footballLimit?: number;
  maxJobs?: number;
  refresh?: boolean;
  dryRun?: boolean;
  onProgress?: (step: {
    index: number;
    total: number;
    job: BackfillJob;
  }) => void;
};

export type SportfunTournamentTpBackfillJobResult = {
  key: string;
  sport: "nfl" | "football";
  status: "ok" | "error" | "skipped";
  rowsPrepared: number;
  rowsUpserted: number;
  error?: string;
};

export type SportfunTournamentTpBackfillReport = {
  fromYear: number;
  toYear: number;
  includeNfl: boolean;
  includeFootball: boolean;
  dryRun: boolean;
  jobsTotal: number;
  jobsProcessed: number;
  rowsPreparedTotal: number;
  rowsUpsertedTotal: number;
  startedAt: string;
  finishedAt: string;
  jobs: SportfunTournamentTpBackfillJobResult[];
};

type NflSummaryPlayer = {
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

type FootballSummaryPlayer = {
  playerId: number;
  playerName: string;
  teamName: string;
  position: string;
  games: number;
  totalPoints: number;
  totalRounded: number;
  average: number;
  rank?: number;
};

function parseSeasonYear(raw: string | undefined): number | null {
  if (!raw) return null;
  const matches = raw.match(/(19|20)\d{2}/g);
  if (!matches?.length) return null;
  const years = matches
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!years.length) return null;
  return Math.max(...years);
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function parsePositiveInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const safeLimit = Math.max(1, Math.min(limit, items.length || 1));
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  return Promise.all(Array.from({ length: safeLimit }, () => run())).then(() => results);
}

function sortNflPlayers(players: NflSummaryPlayer[]): NflSummaryPlayer[] {
  return players
    .slice()
    .sort((a, b) => {
      const roundedDiff = b.totalRounded - a.totalRounded;
      if (roundedDiff !== 0) return roundedDiff;
      const totalDiff = b.totalPoints - a.totalPoints;
      if (totalDiff !== 0) return totalDiff;
      return a.playerName.localeCompare(b.playerName);
    })
    .map((player, index) => ({ ...player, rank: index + 1 }));
}

function sortFootballPlayers(players: FootballSummaryPlayer[]): FootballSummaryPlayer[] {
  return players
    .slice()
    .sort((a, b) => {
      const roundedDiff = b.totalRounded - a.totalRounded;
      if (roundedDiff !== 0) return roundedDiff;
      const totalDiff = b.totalPoints - a.totalPoints;
      if (totalDiff !== 0) return totalDiff;
      return a.playerName.localeCompare(b.playerName);
    })
    .map((player, index) => ({ ...player, rank: index + 1 }));
}

function buildNflJobs(params: {
  fromYear: number;
  toYear: number;
  seasonTypes: string[];
}): NflBackfillJob[] {
  const jobs: NflBackfillJob[] = [];
  for (let season = params.fromYear; season <= params.toYear; season += 1) {
    for (const seasonTypeRaw of params.seasonTypes) {
      const seasonType = seasonTypeRaw.trim().toUpperCase();
      if (!seasonType) continue;
      jobs.push({
        sport: "nfl",
        season,
        seasonType,
        key: `nfl:${season}:${seasonType}`,
      });
    }
  }
  return jobs;
}

async function buildFootballJobs(params: {
  fromYear: number;
  toYear: number;
  limit?: number;
}): Promise<FootballBackfillJob[]> {
  const competitions = await getStatsBombCompetitions();
  const dedupe = new Set<string>();
  const jobs: FootballBackfillJob[] = [];

  for (const competition of competitions) {
    const seasonYear = parseSeasonYear(competition.season_name);
    if (seasonYear === null) continue;
    if (seasonYear < params.fromYear || seasonYear > params.toYear) continue;

    const dedupeKey = `${competition.competition_id}:${competition.season_id}`;
    if (dedupe.has(dedupeKey)) continue;
    dedupe.add(dedupeKey);

    jobs.push({
      sport: "football",
      competitionId: competition.competition_id,
      seasonId: competition.season_id,
      competitionName: competition.competition_name,
      seasonName: competition.season_name ?? "",
      seasonYear,
      key: `football:${competition.competition_id}:${competition.season_id}`,
    });
  }

  jobs.sort((a, b) => {
    if (a.seasonYear !== b.seasonYear) return a.seasonYear - b.seasonYear;
    const compDiff = a.competitionName.localeCompare(b.competitionName);
    if (compDiff !== 0) return compDiff;
    return a.seasonId - b.seasonId;
  });

  if (params.limit && params.limit > 0) {
    return jobs.slice(0, params.limit);
  }
  return jobs;
}

function buildNflTpRows(params: {
  season: number;
  seasonType: string;
  rows: Awaited<ReturnType<typeof fetchNflWeeklyStats>>["rows"];
}): SportfunTournamentTpUpsertRow[] {
  const playerTotals = new Map<string, Omit<NflSummaryPlayer, "average">>();
  let gamesTotal = 0;

  const weekSet = new Set<number>();
  for (const row of params.rows) {
    weekSet.add(row.week);
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
      continue;
    }

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

  const weeks = Array.from(weekSet).sort((a, b) => a - b);
  const firstWeek = weeks[0];
  const lastWeek = weeks[weeks.length - 1];
  const rangeKey = `${firstWeek ?? "all"}-${lastWeek ?? "all"}`;
  const tournamentKey = `nfl:${params.season}:${params.seasonType}:${rangeKey}`;
  const asOf = new Date().toISOString();

  const ranked = sortNflPlayers(
    Array.from(playerTotals.values()).map((player) => ({
      ...player,
      average: player.games > 0 ? player.totalPoints / player.games : 0,
    }))
  );

  return ranked.map((player) => ({
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
      gamesTotal,
      bestWeek: player.bestWeek ?? null,
      bestScore: player.bestScore ?? null,
    },
  }));
}

async function buildFootballTpRows(params: {
  competitionId: number;
  seasonId: number;
  competitionTier?: FootballCompetitionTier;
  refresh?: boolean;
}): Promise<SportfunTournamentTpUpsertRow[]> {
  const matches = await getStatsBombMatches(params.competitionId, params.seasonId);
  if (!matches.length) return [];

  const ordered = [...matches].sort((a, b) => {
    const left = a.match_date ?? "";
    const right = b.match_date ?? "";
    return left.localeCompare(right);
  });

  const playerTotals = new Map<
    number,
    Omit<FootballSummaryPlayer, "average">
  >();

  await mapWithConcurrency(ordered, 2, async (match) => {
    const stats = await buildStatsBombMatchStats({
      matchId: match.match_id,
      competitionId: params.competitionId,
      seasonId: params.seasonId,
      refresh: params.refresh,
    });

    for (const player of stats.players) {
      const score = scoreFootball(player.stats, {
        position: player.position,
        competitionTier: params.competitionTier,
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

  const ranked = sortFootballPlayers(
    Array.from(playerTotals.values()).map((player) => ({
      ...player,
      average: player.games > 0 ? player.totalPoints / player.games : 0,
    }))
  );

  const asOf = new Date().toISOString();
  const tournamentKey = `football:${params.competitionId}:${params.seasonId}`;
  const matchesProcessed = ordered.length;

  return ranked.map((player) => ({
    sport: "football",
    tournamentKey,
    competitionId: params.competitionId,
    seasonId: params.seasonId,
    athleteId: String(player.playerId),
    athleteName: player.playerName,
    team: player.teamName,
    position: player.position,
    games: player.games,
    tpTotal: player.totalRounded,
    tpTotalUnrounded: player.totalPoints,
    tpAverage: player.average,
    rank: player.rank,
    source: "statsbomb_open_data",
    asOf,
    providerPayload: {
      competitionTier: params.competitionTier ?? null,
      matchesProcessed,
    },
  }));
}

export async function backfillSportfunTournamentTp(
  options: SportfunTournamentTpBackfillOptions = {}
): Promise<SportfunTournamentTpBackfillReport> {
  const fromYear = parsePositiveInteger(
    options.fromYear,
    DEFAULT_BACKFILL_START_YEAR,
    2000,
    2100
  );
  const toYear = parsePositiveInteger(
    options.toYear,
    new Date().getUTCFullYear(),
    fromYear,
    2100
  );
  const includeNfl = options.includeNfl ?? true;
  const includeFootball = options.includeFootball ?? true;
  const seasonTypesRaw = options.nflSeasonTypes?.length
    ? options.nflSeasonTypes
    : [...DEFAULT_NFL_SEASON_TYPES];
  const seasonTypes = Array.from(
    new Set(
      seasonTypesRaw
        .map((seasonType) => seasonType.trim().toUpperCase())
        .filter((seasonType) => seasonType.length > 0)
    )
  );
  const footballLimit = options.footballLimit
    ? parsePositiveInteger(options.footballLimit, options.footballLimit, 1, 1000)
    : undefined;

  const jobs: BackfillJob[] = [];
  if (includeNfl && seasonTypes.length > 0) {
    jobs.push(...buildNflJobs({ fromYear, toYear, seasonTypes }));
  }
  if (includeFootball) {
    const footballJobs = await buildFootballJobs({
      fromYear,
      toYear,
      limit: footballLimit,
    });
    jobs.push(...footballJobs);
  }

  const maxJobs = options.maxJobs
    ? parsePositiveInteger(options.maxJobs, options.maxJobs, 1, jobs.length || 1)
    : jobs.length;
  const selectedJobs = jobs.slice(0, maxJobs);

  const startedAt = new Date().toISOString();
  const jobResults: SportfunTournamentTpBackfillJobResult[] = [];
  let rowsPreparedTotal = 0;
  let rowsUpsertedTotal = 0;

  for (let index = 0; index < selectedJobs.length; index += 1) {
    const job = selectedJobs[index];
    options.onProgress?.({ index: index + 1, total: selectedJobs.length, job });
    try {
      let rows: SportfunTournamentTpUpsertRow[] = [];
      if (job.sport === "nfl") {
        const weekly = await fetchNflWeeklyStats({
          season: job.season,
          seasonType: job.seasonType,
        });
        if (!weekly.rows.length) {
          jobResults.push({
            key: job.key,
            sport: job.sport,
            status: "skipped",
            rowsPrepared: 0,
            rowsUpserted: 0,
          });
          continue;
        }
        rows = buildNflTpRows({
          season: job.season,
          seasonType: job.seasonType,
          rows: weekly.rows,
        });
      } else {
        const competitionTier = await getCompetitionTierById(job.competitionId);
        rows = await buildFootballTpRows({
          competitionId: job.competitionId,
          seasonId: job.seasonId,
          competitionTier,
          refresh: options.refresh,
        });
      }

      rowsPreparedTotal += rows.length;
      const upserted = options.dryRun ? rows.length : await upsertSportfunTournamentTpRows(rows);
      rowsUpsertedTotal += upserted;
      jobResults.push({
        key: job.key,
        sport: job.sport,
        status: rows.length ? "ok" : "skipped",
        rowsPrepared: rows.length,
        rowsUpserted: upserted,
      });
    } catch (error: unknown) {
      jobResults.push({
        key: job.key,
        sport: job.sport,
        status: "error",
        rowsPrepared: 0,
        rowsUpserted: 0,
        error: describeError(error),
      });
    }
  }

  return {
    fromYear,
    toYear,
    includeNfl,
    includeFootball,
    dryRun: Boolean(options.dryRun),
    jobsTotal: selectedJobs.length,
    jobsProcessed: jobResults.length,
    rowsPreparedTotal,
    rowsUpsertedTotal,
    startedAt,
    finishedAt: new Date().toISOString(),
    jobs: jobResults,
  };
}

export async function listFootballBackfillCompetitions(params?: {
  fromYear?: number;
  toYear?: number;
}): Promise<StatsBombCompetition[]> {
  const fromYear = parsePositiveInteger(
    params?.fromYear,
    DEFAULT_BACKFILL_START_YEAR,
    2000,
    2100
  );
  const toYear = parsePositiveInteger(
    params?.toYear,
    new Date().getUTCFullYear(),
    fromYear,
    2100
  );
  const competitions = await getStatsBombCompetitions();
  return competitions.filter((competition) => {
    const seasonYear = parseSeasonYear(competition.season_name);
    if (seasonYear === null) return false;
    return seasonYear >= fromYear && seasonYear <= toYear;
  });
}
