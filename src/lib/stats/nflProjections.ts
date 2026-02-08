import { env } from "@/lib/env";
import { scoreNfl } from "@/lib/stats/nfl";
import { withCache } from "@/lib/stats/cache";
import {
  fetchNflPlayers,
  fetchNflSchedule,
  fetchNflTeams,
  fetchNflWeeklyStats,
  type NflPlayerRow,
  type NflWeeklyRow,
} from "@/lib/stats/nflverse";

export type NflProjectionQuerySource = "auto" | "sleeper" | "fallback";
export type NflProjectionRowSource = "sleeper" | "internal_fallback";
export type NflProjectionConfidence = "high" | "medium" | "low";

export type NflProjectionRow = {
  playerId: string;
  team?: string;
  position?: string;
  opponentTeam?: string;
  homeAway: "home" | "away" | null;
  projectedPpr: number | null;
  source: NflProjectionRowSource;
  confidence: NflProjectionConfidence;
  isByeWeek: boolean;
};

export type NflProjectionOptions = {
  season: number;
  week: number;
  seasonType?: string;
  playerIds?: string[];
  source?: NflProjectionQuerySource;
};

type Aggregation = { sum: number; count: number };

type SleeperPlayersResponse = Record<string, SleeperPlayer>;
type SleeperProjectionsResponse = Record<string, SleeperProjectionStats>;

type SleeperPlayer = {
  player_id?: string;
  gsis_id?: string;
  team?: string;
  position?: string;
};

type SleeperProjectionStats = {
  pts_ppr?: number | string;
  pts_half_ppr?: number | string;
  pts_std?: number | string;
};

type FallbackProjectionBreakdown = {
  projectedPpr: number;
  confidence: NflProjectionConfidence;
  oppAdj: number;
};

const PROVIDER_FAILURE_TTL_MS = 10 * 60 * 1000;
const providerFailureLogUntil = new Map<string, number>();

function logProviderFailureOnce(provider: string, message: string, err: unknown) {
  const now = Date.now();
  const key = `${provider}:${message}`;
  const until = providerFailureLogUntil.get(key) ?? 0;
  if (now < until) return;

  providerFailureLogUntil.set(key, now + PROVIDER_FAILURE_TTL_MS);
  const detail = err instanceof Error ? err.message : String(err);
  console.warn(`[nflProjections] ${message} (${provider}): ${detail}`);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function safeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function getAverage(agg: Aggregation | undefined): number {
  if (!agg || agg.count <= 0) return 0;
  return agg.sum / agg.count;
}

function addAggregation(map: Map<string, Aggregation>, key: string, value: number) {
  const current = map.get(key) ?? { sum: 0, count: 0 };
  current.sum += value;
  current.count += 1;
  map.set(key, current);
}

function addNestedAggregation(
  map: Map<string, Map<string, Aggregation>>,
  key: string,
  nestedKey: string,
  value: number
) {
  const nested = map.get(key) ?? new Map<string, Aggregation>();
  const current = nested.get(nestedKey) ?? { sum: 0, count: 0 };
  current.sum += value;
  current.count += 1;
  nested.set(nestedKey, current);
  map.set(key, nested);
}

function normalizeSeasonType(value?: string): "REG" | "POST" | "PRE" {
  const upper = (value ?? "REG").toUpperCase();
  if (upper === "POST" || upper === "PRE") return upper;
  return "REG";
}

function toSleeperSeasonType(value: "REG" | "POST" | "PRE"): "regular" | "post" | "pre" {
  switch (value) {
    case "POST":
      return "post";
    case "PRE":
      return "pre";
    case "REG":
    default:
      return "regular";
  }
}

export function normalizeNflPosition(value?: string): string | undefined {
  if (!value) return undefined;
  const upper = value.trim().toUpperCase();
  if (!upper) return undefined;
  if (upper.includes("QUARTERBACK") || upper === "QB") return "QB";
  if (upper.includes("RUNNING BACK") || upper === "RB") return "RB";
  if (upper.includes("WIDE RECEIVER") || upper === "WR") return "WR";
  if (upper.includes("TIGHT END") || upper === "TE") return "TE";
  if (upper.includes("KICKER") || upper === "K") return "K";
  if (upper.includes("DEF") || upper.includes("DST")) return "DST";
  return upper;
}

function normalizeTeam(value?: string): string | undefined {
  if (!value) return undefined;
  const upper = value.trim().toUpperCase();
  return upper || undefined;
}

type TeamMatchup = {
  opponentTeam?: string;
  homeAway: "home" | "away" | null;
  isByeWeek: boolean;
};

function buildWeekMatchupIndex(params: {
  season: number;
  week: number;
  seasonType: "REG" | "POST" | "PRE";
  teams: string[];
  scheduleRows: Array<{
    season: number;
    week?: number;
    gameType?: string;
    homeTeam?: string;
    awayTeam?: string;
  }>;
}): Map<string, TeamMatchup> {
  const map = new Map<string, TeamMatchup>();

  for (const team of params.teams) {
    map.set(team, { homeAway: null, isByeWeek: true });
  }

  for (const row of params.scheduleRows) {
    if (row.season !== params.season) continue;
    if ((row.week ?? -1) !== params.week) continue;

    const gameType = normalizeSeasonType(row.gameType);
    if (gameType !== params.seasonType) continue;

    const home = normalizeTeam(row.homeTeam);
    const away = normalizeTeam(row.awayTeam);
    if (!home || !away) continue;

    map.set(home, { opponentTeam: away, homeAway: "home", isByeWeek: false });
    map.set(away, { opponentTeam: home, homeAway: "away", isByeWeek: false });
  }

  return map;
}

export function computeInternalFallbackProjection(params: {
  seasonAvgPpr: number;
  l3AvgPpr: number;
  oppPosAllowedAvg: number;
  leaguePosAllowedAvg: number;
  games: number;
}): FallbackProjectionBreakdown {
  const seasonAvgPpr = Number.isFinite(params.seasonAvgPpr) ? params.seasonAvgPpr : 0;
  const l3AvgPpr = Number.isFinite(params.l3AvgPpr) ? params.l3AvgPpr : 0;
  const oppPosAllowedAvg = Number.isFinite(params.oppPosAllowedAvg)
    ? params.oppPosAllowedAvg
    : params.leaguePosAllowedAvg;
  const leaguePosAllowedAvg = Number.isFinite(params.leaguePosAllowedAvg)
    ? params.leaguePosAllowedAvg
    : 0;

  if (params.games < 2) {
    const fallback = seasonAvgPpr || leaguePosAllowedAvg;
    return {
      projectedPpr: round2(fallback),
      confidence: "low",
      oppAdj: 0,
    };
  }

  const oppAdj = clamp((oppPosAllowedAvg - leaguePosAllowedAvg) * 0.35, -3, 3);
  const projectedPpr = round2(0.6 * l3AvgPpr + 0.4 * seasonAvgPpr + oppAdj);

  return {
    projectedPpr,
    confidence: "medium",
    oppAdj: round2(oppAdj),
  };
}

function getScore(row: NflWeeklyRow): number {
  const total = scoreNfl(row.stats).totalRounded;
  return Number.isFinite(total) ? total : 0;
}

export function mapSleeperProjectionsByPlayerId(params: {
  gsisToSleeperId: Map<string, string>;
  projections: SleeperProjectionsResponse;
}): Map<string, number> {
  const out = new Map<string, number>();

  for (const [playerId, sleeperId] of params.gsisToSleeperId.entries()) {
    const projection = params.projections[sleeperId];
    if (!projection) continue;

    const ptsPpr =
      safeNumber(projection.pts_ppr) ??
      safeNumber(projection.pts_half_ppr) ??
      safeNumber(projection.pts_std);
    if (ptsPpr === undefined) continue;

    out.set(playerId, round2(ptsPpr));
  }

  return out;
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 10000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function getSleeperPlayers(): Promise<SleeperPlayersResponse> {
  return withCache("sleeper:nfl:players", 24 * 3600, async () => {
    return fetchJsonWithTimeout<SleeperPlayersResponse>("https://api.sleeper.app/v1/players/nfl", 15000);
  });
}

async function getSleeperProjections(params: {
  season: number;
  week: number;
  seasonType: "REG" | "POST" | "PRE";
}): Promise<SleeperProjectionsResponse> {
  const sleeperSeasonType = toSleeperSeasonType(params.seasonType);
  const key = `sleeper:nfl:projections:${sleeperSeasonType}:${params.season}:${params.week}`;

  return withCache(key, 300, async () => {
    const url = `https://api.sleeper.app/v1/projections/nfl/${sleeperSeasonType}/${params.season}/${params.week}`;
    return fetchJsonWithTimeout<SleeperProjectionsResponse>(url, 12000);
  });
}

function shouldTrySleeper(source: NflProjectionQuerySource, enabledByEnv: boolean): boolean {
  if (source === "fallback") return false;
  if (source === "sleeper") return true;
  return enabledByEnv;
}

function buildPlayerIdSet(rows: NflWeeklyRow[], playerIds?: string[]): Set<string> {
  const set = new Set<string>();

  if (playerIds?.length) {
    for (const playerId of playerIds) {
      if (!playerId) continue;
      set.add(playerId);
    }
    return set;
  }

  for (const row of rows) {
    if (row.player_id) set.add(row.player_id);
  }

  return set;
}

function buildPlayerMap(rows: NflPlayerRow[]): Map<string, NflPlayerRow> {
  return new Map(rows.map((row) => [row.playerId, row]));
}

async function buildInternalFallbackRows(options: NflProjectionOptions): Promise<NflProjectionRow[]> {
  const seasonType = normalizeSeasonType(options.seasonType);

  const [weeklyData, playersData, teamsData, scheduleData] = await Promise.all([
    fetchNflWeeklyStats({ season: options.season, seasonType }),
    fetchNflPlayers(),
    fetchNflTeams(),
    fetchNflSchedule(),
  ]);

  const allRows = weeklyData.rows;
  const historicalRows = allRows.filter((row) => row.week < options.week);

  const targetPlayerIds = buildPlayerIdSet(allRows, options.playerIds);
  if (options.playerIds?.length) {
    for (const playerId of options.playerIds) {
      if (playerId) targetPlayerIds.add(playerId);
    }
  }

  const playerMap = buildPlayerMap(playersData.rows);
  const teamAbbrs = teamsData.rows.map((team) => team.teamAbbr.toUpperCase());
  const matchupMap = buildWeekMatchupIndex({
    season: options.season,
    week: options.week,
    seasonType,
    teams: teamAbbrs,
    scheduleRows: scheduleData.rows,
  });

  const scoresByPlayer = new Map<string, Array<{ week: number; score: number }>>();
  const lastContextByPlayer = new Map<string, { week: number; team?: string; position?: string }>();

  const defensePosAgg = new Map<string, Map<string, Aggregation>>();
  const leaguePosAgg = new Map<string, Aggregation>();

  for (const row of historicalRows) {
    if (!row.player_id) continue;

    const score = getScore(row);
    const week = row.week;

    const scores = scoresByPlayer.get(row.player_id) ?? [];
    scores.push({ week, score });
    scoresByPlayer.set(row.player_id, scores);

    const position = normalizeNflPosition(row.position);
    const team = normalizeTeam(row.team);
    const context = lastContextByPlayer.get(row.player_id);

    if (!context || week >= context.week) {
      lastContextByPlayer.set(row.player_id, {
        week,
        team,
        position: position ?? context?.position,
      });
    }

    if (!position) continue;

    addAggregation(leaguePosAgg, position, score);

    const opponentTeam = normalizeTeam(row.opponent_team);
    if (opponentTeam) {
      addNestedAggregation(defensePosAgg, opponentTeam, position, score);
    }
  }

  const leaguePosAvg = new Map<string, number>();
  for (const [pos, agg] of leaguePosAgg.entries()) {
    leaguePosAvg.set(pos, getAverage(agg));
  }

  const rows: NflProjectionRow[] = [];

  for (const playerId of targetPlayerIds) {
    const playerMeta = playerMap.get(playerId);
    const context = lastContextByPlayer.get(playerId);

    const team = normalizeTeam(context?.team ?? playerMeta?.latestTeam);
    const position = normalizeNflPosition(context?.position ?? playerMeta?.position);

    const matchup = team ? matchupMap.get(team) : undefined;
    const isByeWeek = Boolean(matchup?.isByeWeek);
    const opponentTeam = matchup?.opponentTeam;

    const rawScores = (scoresByPlayer.get(playerId) ?? []).slice().sort((a, b) => a.week - b.week);
    const games = rawScores.length;

    const seasonAvgPpr = games
      ? rawScores.reduce((sum, game) => sum + game.score, 0) / games
      : 0;

    const last3 = rawScores.slice(-3);
    const l3AvgPpr = last3.length
      ? last3.reduce((sum, game) => sum + game.score, 0) / last3.length
      : 0;

    const leaguePosAllowedAvg = position ? leaguePosAvg.get(position) ?? 0 : 0;
    const oppPosAllowedAvg =
      position && opponentTeam
        ? getAverage(defensePosAgg.get(opponentTeam)?.get(position)) || leaguePosAllowedAvg
        : leaguePosAllowedAvg;

    const fallback = computeInternalFallbackProjection({
      seasonAvgPpr,
      l3AvgPpr,
      oppPosAllowedAvg,
      leaguePosAllowedAvg,
      games,
    });

    rows.push({
      playerId,
      team,
      position,
      opponentTeam,
      homeAway: matchup?.homeAway ?? null,
      projectedPpr: isByeWeek ? null : fallback.projectedPpr,
      source: "internal_fallback",
      confidence: isByeWeek ? "low" : fallback.confidence,
      isByeWeek,
    });
  }

  rows.sort((a, b) => a.playerId.localeCompare(b.playerId));
  return rows;
}

async function overlaySleeperRows(params: {
  options: NflProjectionOptions;
  fallbackRows: NflProjectionRow[];
  seasonType: "REG" | "POST" | "PRE";
}): Promise<NflProjectionRow[]> {
  const [playersData, sleeperPlayers, sleeperProjections] = await Promise.all([
    fetchNflPlayers(),
    getSleeperPlayers(),
    getSleeperProjections({
      season: params.options.season,
      week: params.options.week,
      seasonType: params.seasonType,
    }),
  ]);

  const validPlayerIds = new Set(params.fallbackRows.map((row) => row.playerId));
  const gsisToSleeperId = new Map<string, string>();

  for (const [sleeperId, sleeperPlayer] of Object.entries(sleeperPlayers)) {
    const gsis = sleeperPlayer?.gsis_id;
    if (!gsis || !validPlayerIds.has(gsis)) continue;
    gsisToSleeperId.set(gsis, sleeperId);
  }

  if (!gsisToSleeperId.size) return params.fallbackRows;

  const sleeperByPlayerId = mapSleeperProjectionsByPlayerId({
    gsisToSleeperId,
    projections: sleeperProjections,
  });

  if (!sleeperByPlayerId.size) return params.fallbackRows;

  const playerMap = buildPlayerMap(playersData.rows);

  return params.fallbackRows.map((row) => {
    if (row.isByeWeek) {
      return {
        ...row,
        projectedPpr: null,
      };
    }

    const sleeperProjection = sleeperByPlayerId.get(row.playerId);
    if (sleeperProjection === undefined) return row;

    const playerMeta = playerMap.get(row.playerId);

    return {
      ...row,
      projectedPpr: sleeperProjection,
      team: row.team ?? normalizeTeam(playerMeta?.latestTeam),
      position: row.position ?? normalizeNflPosition(playerMeta?.position),
      source: "sleeper",
      confidence: "high",
    };
  });
}

export async function getNflProjections(options: NflProjectionOptions): Promise<NflProjectionRow[]> {
  const source = options.source ?? "auto";
  const seasonType = normalizeSeasonType(options.seasonType);

  const fallbackRows = await buildInternalFallbackRows({ ...options, seasonType });

  if (!shouldTrySleeper(source, env.SLEEPER_PROJECTIONS_ENABLED)) {
    return fallbackRows;
  }

  try {
    return await overlaySleeperRows({
      options: { ...options, seasonType },
      fallbackRows,
      seasonType,
    });
  } catch (err) {
    logProviderFailureOnce(
      "sleeper",
      `falling back to internal projections for ${options.season}-W${options.week}`,
      err
    );
    return fallbackRows;
  }
}
