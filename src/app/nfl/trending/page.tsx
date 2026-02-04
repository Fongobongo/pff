import Link from "next/link";
import NflPageShell from "../_components/NflPageShell";
import { getSportfunMarketSnapshot, toUsdNumber } from "@/lib/sportfunMarket";
import { fetchNflSchedule, fetchNflWeeklyStats, type NflWeeklyRow } from "@/lib/stats/nflverse";
import { scoreNfl } from "@/lib/stats/nfl";

const SAMPLE_SEASONS = [2021, 2022, 2023];
const SEASON_TYPES = ["REG", "POST", "PRE"] as const;
const TREND_WEEKS = 3;
const OPP_WINDOW_WEEKS = 6;
const DEFAULT_LOOKBACK_WEEKS = 8;

const TOP_THRESHOLDS: Record<string, number> = {
  QB: 12,
  RB: 24,
  WR: 24,
  TE: 12,
  K: 12,
  DST: 12,
};

const TREND_FILTERS = [
  { key: "all", label: "All" },
  { key: "up", label: "Risers" },
  { key: "down", label: "Fallers" },
] as const;

const RANK_MODE_OPTIONS = [
  { key: "pos", label: "Pos rank" },
  { key: "all", label: "Overall rank" },
] as const;

const HOME_AWAY_OPTIONS = [
  { key: "all", label: "All" },
  { key: "home", label: "Home" },
  { key: "away", label: "Away" },
] as const;

const SPLIT_MODE_OPTIONS = [
  { key: "all", label: "All games" },
  { key: "home", label: "Home only" },
  { key: "away", label: "Away only" },
] as const;

const PRESET_OPTIONS = [
  {
    key: "wr-usage",
    label: "WR usage",
    params: {
      position: "WR",
      sort: "usage_score",
      min_targets: "6",
      min_target_share: "18",
      min_wopr: "0.45",
    },
  },
  {
    key: "wr-air",
    label: "WR air yards",
    params: {
      position: "WR",
      sort: "air_yards_l3",
      min_air: "60",
      min_air_share: "25",
    },
  },
  {
    key: "wr-vertical",
    label: "WR vertical",
    params: {
      position: "WR",
      sort: "ypt",
      min_ypt: "8",
      min_air: "50",
    },
  },
  {
    key: "rb-workload",
    label: "RB workload",
    params: {
      position: "RB",
      sort: "touches_l3",
      min_touches: "12",
      min_targets: "2",
    },
  },
  {
    key: "rb-receiving",
    label: "RB receiving",
    params: {
      position: "RB",
      sort: "target_share",
      min_targets: "3",
      min_target_share: "8",
    },
  },
  {
    key: "qb-efficiency",
    label: "QB volume",
    params: {
      position: "QB",
      sort: "season",
      min_games: "4",
    },
  },
  {
    key: "qb-rush",
    label: "QB rushing",
    params: {
      position: "QB",
      sort: "touches_l3",
      min_touches: "4",
    },
  },
  {
    key: "te-usage",
    label: "TE usage",
    params: {
      position: "TE",
      sort: "usage_score",
      min_targets: "4",
      min_target_share: "12",
    },
  },
  {
    key: "signals",
    label: "Signals",
    params: {
      sort: "signal",
      min_usage: "0.6",
      min_usage_trend: "0.4",
    },
  },
] as const;

const SORT_OPTIONS = [
  { key: "l3", label: "L3 Avg FPts" },
  { key: "season", label: "Season FPPG" },
  { key: "trend", label: "Trend Δ" },
  { key: "l3_vs_season", label: "L3 vs Season" },
  { key: "tp_rate_l3", label: "TP Rate L3" },
  { key: "l3_rank", label: "L3 Avg Rank" },
  { key: "consistency", label: "Consistency" },
  { key: "targets_l3", label: "L3 Targets" },
  { key: "touches_l3", label: "L3 Touches" },
  { key: "yards_l3", label: "L3 Yards" },
  { key: "ypt_l3", label: "Yards/Touch" },
  { key: "air_yards_l3", label: "L3 Air Yards" },
  { key: "targets_delta", label: "Targets Δ" },
  { key: "touches_delta", label: "Touches Δ" },
  { key: "air_delta", label: "Air Δ" },
  { key: "target_share", label: "Target Share" },
  { key: "air_share", label: "Air Share" },
  { key: "wopr", label: "WOPR" },
  { key: "racr", label: "RACR" },
  { key: "catch_rate", label: "Catch %" },
  { key: "ypt", label: "Yards/Target" },
  { key: "usage_score", label: "Usage Score" },
  { key: "usage_trend", label: "Usage Trend" },
  { key: "usage_share", label: "Usage Share" },
  { key: "signal", label: "Signal" },
  { key: "cluster", label: "Usage Cluster" },
  { key: "home_l3", label: "Home L3" },
  { key: "away_l3", label: "Away L3" },
  { key: "home_avg", label: "Home FPPG" },
  { key: "away_avg", label: "Away FPPG" },
  { key: "home_vs_away", label: "Home vs Away" },
  { key: "opp_delta", label: "Opp Δ" },
  { key: "opp_rank", label: "Opp Rank" },
  { key: "games", label: "Games" },
  { key: "price", label: "Price" },
] as const;

function parseNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatUsd(raw?: string): string {
  if (!raw) return "—";
  const value = toUsdNumber(raw);
  const abs = Math.abs(value);
  if (abs >= 1000) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (abs >= 1) return `$${value.toFixed(2)}`;
  if (abs >= 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(6)}`;
}

function formatPercent(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatNumber(value?: number, decimals = 2): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(decimals);
}

function formatRank(value?: number): string {
  if (!value || Number.isNaN(value)) return "—";
  return `${value}`;
}

function average(values: number[]): number | undefined {
  if (!values.length) return undefined;
  return values.reduce((acc, val) => acc + val, 0) / values.length;
}

function standardDeviation(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const mean = values.reduce((acc, val) => acc + val, 0) / values.length;
  const variance =
    values.reduce((acc, val) => acc + (val - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function zScore(value: number | undefined, mean: number, std: number): number {
  if (value === undefined || Number.isNaN(value) || std === 0) return 0;
  return (value - mean) / std;
}

function buildQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

type TokenInfo = {
  tokenIdDec: string;
  name?: string;
  currentPriceUsdcRaw?: string;
  priceChange24hPercent?: number;
};

type WeekScore = {
  week: number;
  score: number;
  rank?: number;
  posRank?: number;
  opponent?: string;
  homeAway?: "HOME" | "AWAY";
  usage?: {
    carries?: number;
    targets?: number;
    receptions?: number;
    rushingYards?: number;
    receivingYards?: number;
    passingYards?: number;
    airYards?: number;
  };
};

type TrendRow = {
  playerId: string;
  playerName: string;
  position?: string;
  team?: string;
  games: number;
  homeGames: number;
  awayGames: number;
  seasonAvg: number;
  homeAvg?: number;
  awayAvg?: number;
  l3Avg: number;
  l3AvgRank?: number;
  l3StdDev?: number;
  l3Floor?: number;
  l3Ceiling?: number;
  l3VsSeason?: number;
  l3Targets?: number;
  l3Carries?: number;
  l3Touches?: number;
  l3Yards?: number;
  l3AirYards?: number;
  l3YardsPerTouch?: number;
  homeL3Avg?: number;
  awayL3Avg?: number;
  homeVsAway?: number;
  l3TargetsDelta?: number;
  l3TouchesDelta?: number;
  l3AirYardsDelta?: number;
  l3TargetShare?: number;
  l3AirShare?: number;
  l3Wopr?: number;
  l3Racr?: number;
  l3CatchRate?: number;
  l3YardsPerTarget?: number;
  usageTrendScore?: number;
  usageShareScore?: number;
  usageScore?: number;
  usageCluster?: "Low" | "Medium" | "High";
  signal?: "Surge" | "Breakout" | "Fade" | "Neutral";
  tpRateL3: number;
  trend?: number;
  oppDelta?: number;
  oppRank?: number;
  lastOpp?: string;
  lastHomeAway?: "HOME" | "AWAY";
  token?: TokenInfo;
  weeks: WeekScore[];
};

function buildTokenIndex(tokens: TokenInfo[]): Map<string, TokenInfo> {
  const map = new Map<string, TokenInfo>();
  for (const token of tokens) {
    if (!token.name) continue;
    const key = normalizeName(token.name);
    if (!key) continue;
    const current = map.get(key);
    if (!current) {
      map.set(key, token);
      continue;
    }
    const currentPrice = current.currentPriceUsdcRaw ? toUsdNumber(current.currentPriceUsdcRaw) : 0;
    const nextPrice = token.currentPriceUsdcRaw ? toUsdNumber(token.currentPriceUsdcRaw) : 0;
    if (nextPrice > currentPrice) map.set(key, token);
  }
  return map;
}

function groupWeeks(rows: NflWeeklyRow[], scores: Map<string, number>) {
  const weekMap = new Map<number, NflWeeklyRow[]>();
  for (const row of rows) {
    if (!row.week) continue;
    const list = weekMap.get(row.week) ?? [];
    list.push(row);
    weekMap.set(row.week, list);
  }

  const weekRanks = new Map<number, Map<string, number>>();
  const weekPosRanks = new Map<number, Map<string, Map<string, number>>>();

  for (const [week, weekRows] of weekMap.entries()) {
    const getScore = (row: NflWeeklyRow) => scores.get(`${row.player_id}:${row.week}`) ?? 0;
    const sorted = weekRows
      .slice()
      .sort((a, b) => getScore(b) - getScore(a));

    const rankMap = new Map<string, number>();
    sorted.forEach((row, idx) => rankMap.set(row.player_id, idx + 1));
    weekRanks.set(week, rankMap);

    const posMap = new Map<string, NflWeeklyRow[]>();
    for (const row of weekRows) {
      const pos = row.position?.toUpperCase() ?? "UNK";
      const list = posMap.get(pos) ?? [];
      list.push(row);
      posMap.set(pos, list);
    }

    const posRanks = new Map<string, Map<string, number>>();
    for (const [pos, posRows] of posMap.entries()) {
      const sortedPos = posRows
        .slice()
        .sort((a, b) => getScore(b) - getScore(a));
      const posRankMap = new Map<string, number>();
      sortedPos.forEach((row, idx) => posRankMap.set(row.player_id, idx + 1));
      posRanks.set(pos, posRankMap);
    }
    weekPosRanks.set(week, posRanks);
  }

  return { weekRanks, weekPosRanks };
}

export default async function NflTrendingPage({
  searchParams,
}: {
  searchParams: Promise<{
    season?: string;
    week?: string;
    season_type?: string;
    sort?: string;
    position?: string;
    trend?: string;
    opp?: string;
    q?: string;
    rank_mode?: string;
    min_games?: string;
    min_l3?: string;
    min_season?: string;
    min_tp_rate?: string;
    token_only?: string;
    home_away?: string;
    lookback?: string;
    min_targets?: string;
    min_touches?: string;
    min_air?: string;
    min_target_share?: string;
    min_air_share?: string;
    min_wopr?: string;
    min_catch?: string;
    min_ypt?: string;
    split_mode?: string;
    min_usage?: string;
    min_usage_trend?: string;
    min_usage_share?: string;
  }>;
}) {
  const params = await searchParams;
  const season = parseNumber(params.season, 2023, 1999, 2099);
  const seasonType = (params.season_type ?? "REG").toUpperCase();
  const sort = SORT_OPTIONS.find((opt) => opt.key === params.sort)?.key ?? "l3";
  const trendFilter = TREND_FILTERS.find((opt) => opt.key === params.trend)?.key ?? "all";
  const positionFilter = params.position?.toUpperCase();
  const oppFilter = params.opp?.toUpperCase();
  const q = params.q?.trim().toLowerCase() ?? "";
  const rankMode = RANK_MODE_OPTIONS.find((opt) => opt.key === params.rank_mode)?.key ?? "pos";
  const minGames = parseNumber(params.min_games, 0, 0, 25);
  const minL3 = parseNumber(params.min_l3, 0, 0, 100);
  const minSeason = parseNumber(params.min_season, 0, 0, 100);
  const minTpRate = parseNumber(params.min_tp_rate, 0, 0, 100);
  const tokenOnly = params.token_only === "1";
  const homeAway = HOME_AWAY_OPTIONS.find((opt) => opt.key === params.home_away)?.key ?? "all";
  const lookback = parseNumber(params.lookback, DEFAULT_LOOKBACK_WEEKS, 1, 18);
  const minTargets = parseNumber(params.min_targets, 0, 0, 50);
  const minTouches = parseNumber(params.min_touches, 0, 0, 60);
  const minAir = parseNumber(params.min_air, 0, 0, 300);
  const minTargetShare = parseNumber(params.min_target_share, 0, 0, 100);
  const minAirShare = parseNumber(params.min_air_share, 0, 0, 100);
  const minWopr = parseNumber(params.min_wopr, 0, 0, 1);
  const minCatch = parseNumber(params.min_catch, 0, 0, 100);
  const minYpt = parseNumber(params.min_ypt, 0, 0, 50);
  const splitMode = SPLIT_MODE_OPTIONS.find((opt) => opt.key === params.split_mode)?.key ?? "all";
  const minUsage = parseNumber(params.min_usage, -5, -10, 10);
  const minUsageTrend = parseNumber(params.min_usage_trend, -5, -10, 10);
  const minUsageShare = parseNumber(params.min_usage_share, -5, -10, 10);

  const [snapshot, weeklyData, schedule] = await Promise.all([
    getSportfunMarketSnapshot({ sport: "nfl", windowHours: 24, trendDays: 30, maxTokens: 500 }),
    fetchNflWeeklyStats({ season, seasonType }),
    fetchNflSchedule(),
  ]);

  const weeks = Array.from(new Set(weeklyData.rows.map((row) => row.week).filter(Boolean))).sort(
    (a, b) => a - b
  );
  const latestWeek = weeks.length ? weeks[weeks.length - 1] : 1;
  const selectedWeek = parseNumber(params.week, latestWeek, 1, 25);
  const viewWeek = weeks.includes(selectedWeek) ? selectedWeek : latestWeek;
  const availableWeeks = weeks.filter((wk) => wk <= viewWeek);
  const windowWeeks = availableWeeks.slice(-lookback);
  const windowWeekSet = new Set(windowWeeks);

  const analysisRows = weeklyData.rows.filter((row) => row.week && windowWeekSet.has(row.week));

  const scheduleRows = schedule.rows.filter(
    (row) =>
      row.season === season &&
      row.gameType === seasonType &&
      row.week &&
      windowWeekSet.has(row.week)
  );
  const homeAwayMap = new Map<string, "HOME" | "AWAY">();
  for (const game of scheduleRows) {
    if (!game.week || !game.homeTeam || !game.awayTeam) continue;
    const home = game.homeTeam.toUpperCase();
    const away = game.awayTeam.toUpperCase();
    const keyHome = `${game.week}|${home}|${away}`;
    const keyAway = `${game.week}|${away}|${home}`;
    homeAwayMap.set(keyHome, "HOME");
    homeAwayMap.set(keyAway, "AWAY");
  }

  const scores = new Map<string, number>();
  for (const row of analysisRows) {
    const score = scoreNfl(row.stats).totalRounded ?? 0;
    scores.set(`${row.player_id}:${row.week}`, score);
  }

  const { weekRanks, weekPosRanks } = groupWeeks(analysisRows, scores);

  const tokenIndex = buildTokenIndex(
    snapshot.tokens.map((token) => ({
      tokenIdDec: token.tokenIdDec,
      name: token.name,
      currentPriceUsdcRaw: token.currentPriceUsdcRaw,
      priceChange24hPercent: token.priceChange24hPercent,
    }))
  );

  const oppWindowWeeks = windowWeeks.slice(-OPP_WINDOW_WEEKS);
  const oppWindowSet = new Set(oppWindowWeeks);
  const oppRows = analysisRows.filter((row) => row.week && oppWindowSet.has(row.week));
  const oppPosScores = new Map<string, number[]>();
  const leaguePosScores = new Map<string, number[]>();
  for (const row of oppRows) {
    const opponent = row.opponent_team?.toUpperCase();
    const pos = row.position?.toUpperCase() ?? "UNK";
    const score = scores.get(`${row.player_id}:${row.week}`) ?? 0;
    if (opponent) {
      const key = `${opponent}|${pos}`;
      const list = oppPosScores.get(key) ?? [];
      list.push(score);
      oppPosScores.set(key, list);
    }
    const leagueList = leaguePosScores.get(pos) ?? [];
    leagueList.push(score);
    leaguePosScores.set(pos, leagueList);
  }

  const oppRankByPos = new Map<string, Map<string, number>>();
  const oppBuckets = new Map<string, { opp: string; avg: number }[]>();
  for (const [key, values] of oppPosScores.entries()) {
    const [opp, pos] = key.split("|");
    const avg = average(values);
    if (!opp || !pos || avg === undefined) continue;
    const list = oppBuckets.get(pos) ?? [];
    list.push({ opp, avg });
    oppBuckets.set(pos, list);
  }
  for (const [pos, list] of oppBuckets.entries()) {
    list.sort((a, b) => b.avg - a.avg);
    const rankMap = new Map<string, number>();
    list.forEach((item, idx) => rankMap.set(item.opp, idx + 1));
    oppRankByPos.set(pos, rankMap);
  }

  const players = new Map<string, TrendRow>();

  for (const row of analysisRows) {
    if (!row.player_id) continue;
    const playerName = row.player_display_name || row.player_name || row.player_id;
    const entry = players.get(row.player_id) ?? {
      playerId: row.player_id,
      playerName,
      position: row.position,
      team: row.team,
      games: 0,
      homeGames: 0,
      awayGames: 0,
      seasonAvg: 0,
      homeAvg: undefined,
      awayAvg: undefined,
      l3Avg: 0,
      l3AvgRank: undefined,
      l3StdDev: undefined,
      l3Floor: undefined,
      l3Ceiling: undefined,
      l3VsSeason: undefined,
      tpRateL3: 0,
      weeks: [],
      token: tokenIndex.get(normalizeName(playerName)),
    };

    const score = scores.get(`${row.player_id}:${row.week}`) ?? 0;
    const rank = row.week ? weekRanks.get(row.week)?.get(row.player_id) : undefined;
    const posRank = row.week
      ? weekPosRanks.get(row.week)?.get((row.position ?? "UNK").toUpperCase())?.get(row.player_id)
      : undefined;

    if (row.week) {
      const team = row.team?.toUpperCase();
      const opp = row.opponent_team?.toUpperCase();
      const homeAway =
        row.week && team && opp ? homeAwayMap.get(`${row.week}|${team}|${opp}`) : undefined;
      entry.weeks.push({
        week: row.week,
        score,
        rank,
        posRank,
        opponent: opp,
        homeAway,
        usage: row.usage,
      });
    }

    players.set(row.player_id, entry);
  }

  const rows: TrendRow[] = Array.from(players.values()).map((entry) => {
    entry.weeks.sort((a, b) => a.week - b.week);
    const filteredWeeks =
      splitMode === "home"
        ? entry.weeks.filter((w) => w.homeAway === "HOME")
        : splitMode === "away"
          ? entry.weeks.filter((w) => w.homeAway === "AWAY")
          : entry.weeks;

    const lastOpp = filteredWeeks.length ? filteredWeeks[filteredWeeks.length - 1].opponent : undefined;
    const last3 = filteredWeeks.slice(-TREND_WEEKS);
    const prev3 = filteredWeeks.slice(-TREND_WEEKS * 2, -TREND_WEEKS);

    const total = filteredWeeks.reduce((acc, val) => acc + val.score, 0);
    entry.games = filteredWeeks.length;
    entry.seasonAvg = entry.games ? total / entry.games : 0;

    const homeWeeks = entry.weeks.filter((w) => w.homeAway === "HOME");
    const awayWeeks = entry.weeks.filter((w) => w.homeAway === "AWAY");
    entry.homeGames = homeWeeks.length;
    entry.awayGames = awayWeeks.length;
    const homeTotal = homeWeeks.reduce((acc, val) => acc + val.score, 0);
    const awayTotal = awayWeeks.reduce((acc, val) => acc + val.score, 0);
    entry.homeAvg = entry.homeGames ? homeTotal / entry.homeGames : undefined;
    entry.awayAvg = entry.awayGames ? awayTotal / entry.awayGames : undefined;

    entry.l3Avg = last3.length ? last3.reduce((acc, val) => acc + val.score, 0) / last3.length : 0;
    const l3RankValues =
      rankMode === "all"
        ? last3.map((w) => w.rank).filter((v): v is number => Boolean(v))
        : last3.map((w) => w.posRank).filter((v): v is number => Boolean(v));
    entry.l3AvgRank = l3RankValues.length
      ? l3RankValues.reduce((acc, val) => acc + val, 0) / l3RankValues.length
      : undefined;
    const l3Scores = last3.map((w) => w.score);
    entry.l3StdDev = standardDeviation(l3Scores);
    entry.l3Floor = l3Scores.length ? Math.min(...l3Scores) : undefined;
    entry.l3Ceiling = l3Scores.length ? Math.max(...l3Scores) : undefined;
    entry.l3VsSeason = entry.l3Avg - entry.seasonAvg;

    const homeL3 = last3.filter((w) => w.homeAway === "HOME");
    const awayL3 = last3.filter((w) => w.homeAway === "AWAY");
    entry.homeL3Avg = homeL3.length ? homeL3.reduce((acc, val) => acc + val.score, 0) / homeL3.length : undefined;
    entry.awayL3Avg = awayL3.length ? awayL3.reduce((acc, val) => acc + val.score, 0) / awayL3.length : undefined;
    if (entry.homeL3Avg !== undefined && entry.awayL3Avg !== undefined) {
      entry.homeVsAway = entry.homeL3Avg - entry.awayL3Avg;
    }

    const l3Count = last3.length;
    const l3TargetsTotal = last3.reduce((acc, w) => acc + (w.usage?.targets ?? 0), 0);
    const l3CarriesTotal = last3.reduce((acc, w) => acc + (w.usage?.carries ?? 0), 0);
    const l3ReceptionsTotal = last3.reduce((acc, w) => acc + (w.usage?.receptions ?? 0), 0);
    const l3RushYardsTotal = last3.reduce((acc, w) => acc + (w.usage?.rushingYards ?? 0), 0);
    const l3RecYardsTotal = last3.reduce((acc, w) => acc + (w.usage?.receivingYards ?? 0), 0);
    const l3AirYardsTotal = last3.reduce((acc, w) => acc + (w.usage?.airYards ?? 0), 0);
    const l3TargetShareTotal = last3.reduce((acc, w) => acc + (w.usage?.targetShare ?? 0), 0);
    const l3AirShareTotal = last3.reduce((acc, w) => acc + (w.usage?.airYardsShare ?? 0), 0);
    const l3WoprTotal = last3.reduce((acc, w) => acc + (w.usage?.wopr ?? 0), 0);
    const l3RacrTotal = last3.reduce((acc, w) => acc + (w.usage?.racr ?? 0), 0);
    const touchesTotal = l3CarriesTotal + l3ReceptionsTotal;

    entry.l3Targets = l3Count ? l3TargetsTotal / l3Count : 0;
    entry.l3Carries = l3Count ? l3CarriesTotal / l3Count : 0;
    entry.l3Touches = l3Count ? touchesTotal / l3Count : 0;
    entry.l3Yards = l3Count ? (l3RushYardsTotal + l3RecYardsTotal) / l3Count : 0;
    entry.l3AirYards = l3Count ? l3AirYardsTotal / l3Count : 0;
    entry.l3YardsPerTouch = touchesTotal > 0 ? (l3RushYardsTotal + l3RecYardsTotal) / touchesTotal : undefined;
    entry.l3TargetShare = l3Count ? l3TargetShareTotal / l3Count : undefined;
    entry.l3AirShare = l3Count ? l3AirShareTotal / l3Count : undefined;
    entry.l3Wopr = l3Count ? l3WoprTotal / l3Count : undefined;
    entry.l3Racr = l3Count ? l3RacrTotal / l3Count : undefined;
    entry.l3CatchRate = l3TargetsTotal > 0 ? l3ReceptionsTotal / l3TargetsTotal : undefined;
    entry.l3YardsPerTarget = l3TargetsTotal > 0 ? l3RecYardsTotal / l3TargetsTotal : undefined;

    const prevTargetsTotal = prev3.reduce((acc, w) => acc + (w.usage?.targets ?? 0), 0);
    const prevCarriesTotal = prev3.reduce((acc, w) => acc + (w.usage?.carries ?? 0), 0);
    const prevReceptionsTotal = prev3.reduce((acc, w) => acc + (w.usage?.receptions ?? 0), 0);
    const prevAirYardsTotal = prev3.reduce((acc, w) => acc + (w.usage?.airYards ?? 0), 0);
    const prevTouchesTotal = prevCarriesTotal + prevReceptionsTotal;
    const prevCount = prev3.length;
    const prevTargetsAvg = prevCount ? prevTargetsTotal / prevCount : 0;
    const prevTouchesAvg = prevCount ? prevTouchesTotal / prevCount : 0;
    const prevAirAvg = prevCount ? prevAirYardsTotal / prevCount : 0;
    entry.l3TargetsDelta = entry.l3Targets - prevTargetsAvg;
    entry.l3TouchesDelta = entry.l3Touches - prevTouchesAvg;
    entry.l3AirYardsDelta = entry.l3AirYards - prevAirAvg;

    const pos = (entry.position ?? "UNK").toUpperCase();
    const threshold = TOP_THRESHOLDS[pos] ?? 24;
    const tpCountL3 = last3.filter((w) => w.posRank && w.posRank <= threshold).length;
    entry.tpRateL3 = last3.length ? tpCountL3 / last3.length : 0;

    const prevAvg = prev3.length ? prev3.reduce((acc, val) => acc + val.score, 0) / prev3.length : undefined;
    entry.trend = prevAvg !== undefined ? entry.l3Avg - prevAvg : undefined;

    if (lastOpp) {
      entry.lastOpp = lastOpp;
      const oppKey = `${lastOpp}|${pos}`;
      const oppAvg = average(oppPosScores.get(oppKey) ?? []);
      const leagueAvg = average(leaguePosScores.get(pos) ?? []);
      if (oppAvg !== undefined && leagueAvg !== undefined) {
        entry.oppDelta = oppAvg - leagueAvg;
      }
      entry.oppRank = oppRankByPos.get(pos)?.get(lastOpp);
    }

    entry.lastHomeAway = last3.length ? last3[last3.length - 1].homeAway : undefined;

    return entry;
  });

  const usageScores = rows
    .map((row) => row.usageScore)
    .filter((value): value is number => value !== undefined && Number.isFinite(value))
    .sort((a, b) => a - b);
  const usageLow = usageScores.length ? usageScores[Math.floor(usageScores.length * 0.33)] : undefined;
  const usageHigh = usageScores.length ? usageScores[Math.floor(usageScores.length * 0.66)] : undefined;

  for (const row of rows) {
    if (row.usageScore === undefined) {
      row.usageCluster = "Medium";
    } else if (usageLow !== undefined && row.usageScore <= usageLow) {
      row.usageCluster = "Low";
    } else if (usageHigh !== undefined && row.usageScore >= usageHigh) {
      row.usageCluster = "High";
    } else {
      row.usageCluster = "Medium";
    }

    const usageScore = row.usageScore ?? 0;
    const l3Delta = row.l3VsSeason ?? 0;
    if (usageScore >= 1.2 && l3Delta >= 3) {
      row.signal = "Surge";
    } else if (usageScore >= 0.6 && l3Delta >= 1.5) {
      row.signal = "Breakout";
    } else if (usageScore <= -0.6 && l3Delta <= -1.5) {
      row.signal = "Fade";
    } else {
      row.signal = "Neutral";
    }
  }

  const usageByPos = new Map<
    string,
    {
      targetsDelta: number[];
      touchesDelta: number[];
      airDelta: number[];
      targetShare: number[];
      airShare: number[];
      wopr: number[];
    }
  >();

  for (const row of rows) {
    const pos = (row.position ?? "UNK").toUpperCase();
    const entry = usageByPos.get(pos) ?? {
      targetsDelta: [],
      touchesDelta: [],
      airDelta: [],
      targetShare: [],
      airShare: [],
      wopr: [],
    };
    if (row.l3TargetsDelta !== undefined) entry.targetsDelta.push(row.l3TargetsDelta);
    if (row.l3TouchesDelta !== undefined) entry.touchesDelta.push(row.l3TouchesDelta);
    if (row.l3AirYardsDelta !== undefined) entry.airDelta.push(row.l3AirYardsDelta);
    if (row.l3TargetShare !== undefined) entry.targetShare.push(row.l3TargetShare);
    if (row.l3AirShare !== undefined) entry.airShare.push(row.l3AirShare);
    if (row.l3Wopr !== undefined) entry.wopr.push(row.l3Wopr);
    usageByPos.set(pos, entry);
  }

  const usageStatsByPos = new Map<
    string,
    {
      targetsDelta: { mean: number; std: number };
      touchesDelta: { mean: number; std: number };
      airDelta: { mean: number; std: number };
      targetShare: { mean: number; std: number };
      airShare: { mean: number; std: number };
      wopr: { mean: number; std: number };
    }
  >();

  for (const [pos, entry] of usageByPos.entries()) {
    const targetsMean = average(entry.targetsDelta) ?? 0;
    const touchesMean = average(entry.touchesDelta) ?? 0;
    const airMean = average(entry.airDelta) ?? 0;
    const targetShareMean = average(entry.targetShare) ?? 0;
    const airShareMean = average(entry.airShare) ?? 0;
    const woprMean = average(entry.wopr) ?? 0;

    usageStatsByPos.set(pos, {
      targetsDelta: {
        mean: targetsMean,
        std: standardDeviation(entry.targetsDelta) ?? 0,
      },
      touchesDelta: {
        mean: touchesMean,
        std: standardDeviation(entry.touchesDelta) ?? 0,
      },
      airDelta: {
        mean: airMean,
        std: standardDeviation(entry.airDelta) ?? 0,
      },
      targetShare: {
        mean: targetShareMean,
        std: standardDeviation(entry.targetShare) ?? 0,
      },
      airShare: {
        mean: airShareMean,
        std: standardDeviation(entry.airShare) ?? 0,
      },
      wopr: {
        mean: woprMean,
        std: standardDeviation(entry.wopr) ?? 0,
      },
    });
  }

  for (const row of rows) {
    const pos = (row.position ?? "UNK").toUpperCase();
    const stats = usageStatsByPos.get(pos);
    if (!stats) continue;
    const zTargets = zScore(row.l3TargetsDelta, stats.targetsDelta.mean, stats.targetsDelta.std);
    const zTouches = zScore(row.l3TouchesDelta, stats.touchesDelta.mean, stats.touchesDelta.std);
    const zAir = zScore(row.l3AirYardsDelta, stats.airDelta.mean, stats.airDelta.std);
    const zTargetShare = zScore(row.l3TargetShare, stats.targetShare.mean, stats.targetShare.std);
    const zAirShare = zScore(row.l3AirShare, stats.airShare.mean, stats.airShare.std);
    const zWopr = zScore(row.l3Wopr, stats.wopr.mean, stats.wopr.std);

    let trendScore = (zTargets + zTouches + zAir) / 3;
    let shareScore = (zTargetShare + zAirShare + zWopr) / 3;
    let usageScore = trendScore * 0.6 + shareScore * 0.4;

    if (pos === "WR" || pos === "TE") {
      trendScore = (zTargets + zAir) / 2;
      shareScore = (zTargetShare + zAirShare + zWopr) / 3;
      usageScore = trendScore * 0.55 + shareScore * 0.45;
    } else if (pos === "RB") {
      trendScore = (zTouches + zTargets) / 2;
      shareScore = (zTargetShare + zWopr) / 2;
      usageScore = trendScore * 0.65 + shareScore * 0.35;
    } else if (pos === "QB") {
      trendScore = zTouches;
      shareScore = zTargetShare;
      usageScore = trendScore * 0.7 + shareScore * 0.3;
    }

    row.usageTrendScore = trendScore;
    row.usageShareScore = shareScore;
    row.usageScore = usageScore;
  }

  const positions = Array.from(
    new Set(rows.map((row) => row.position).filter((value): value is string => Boolean(value)))
  ).sort();
  const opponentOptions = Array.from(
    new Set(rows.map((row) => row.lastOpp).filter((value): value is string => Boolean(value)))
  ).sort();

  let filtered = rows;

  if (positionFilter) {
    filtered = filtered.filter((row) => (row.position ?? "").toUpperCase() === positionFilter);
  }

  if (trendFilter === "up") {
    filtered = filtered.filter((row) => (row.trend ?? 0) > 0);
  } else if (trendFilter === "down") {
    filtered = filtered.filter((row) => (row.trend ?? 0) < 0);
  }

  if (oppFilter) {
    filtered = filtered.filter((row) => row.lastOpp === oppFilter);
  }

  if (q) {
    filtered = filtered.filter((row) => row.playerName.toLowerCase().includes(q));
  }

  if (tokenOnly) {
    filtered = filtered.filter((row) => Boolean(row.token));
  }

  if (homeAway !== "all") {
    const desired = homeAway === "home" ? "HOME" : "AWAY";
    filtered = filtered.filter((row) => row.lastHomeAway === desired);
  }

  if (minGames > 0) {
    filtered = filtered.filter((row) => row.games >= minGames);
  }

  if (minL3 > 0) {
    filtered = filtered.filter((row) => row.l3Avg >= minL3);
  }

  if (minSeason > 0) {
    filtered = filtered.filter((row) => row.seasonAvg >= minSeason);
  }

  if (minTpRate > 0) {
    filtered = filtered.filter((row) => row.tpRateL3 * 100 >= minTpRate);
  }

  if (minTargets > 0) {
    filtered = filtered.filter((row) => (row.l3Targets ?? 0) >= minTargets);
  }

  if (minTouches > 0) {
    filtered = filtered.filter((row) => (row.l3Touches ?? 0) >= minTouches);
  }

  if (minAir > 0) {
    filtered = filtered.filter((row) => (row.l3AirYards ?? 0) >= minAir);
  }

  if (minTargetShare > 0) {
    filtered = filtered.filter((row) => (row.l3TargetShare ?? 0) * 100 >= minTargetShare);
  }

  if (minAirShare > 0) {
    filtered = filtered.filter((row) => (row.l3AirShare ?? 0) * 100 >= minAirShare);
  }

  if (minWopr > 0) {
    filtered = filtered.filter((row) => (row.l3Wopr ?? 0) >= minWopr);
  }

  if (minCatch > 0) {
    filtered = filtered.filter((row) => (row.l3CatchRate ?? 0) * 100 >= minCatch);
  }

  if (minYpt > 0) {
    filtered = filtered.filter((row) => (row.l3YardsPerTarget ?? 0) >= minYpt);
  }

  if (minUsage > -5) {
    filtered = filtered.filter((row) => (row.usageScore ?? -Infinity) >= minUsage);
  }

  if (minUsageTrend > -5) {
    filtered = filtered.filter((row) => (row.usageTrendScore ?? -Infinity) >= minUsageTrend);
  }

  if (minUsageShare > -5) {
    filtered = filtered.filter((row) => (row.usageShareScore ?? -Infinity) >= minUsageShare);
  }

  const signalPriority: Record<string, number> = {
    Surge: 3,
    Breakout: 2,
    Neutral: 1,
    Fade: 0,
  };
  const clusterPriority: Record<string, number> = {
    High: 2,
    Medium: 1,
    Low: 0,
  };

  const sorted = filtered.slice().sort((a, b) => {
    switch (sort) {
      case "trend":
        return (b.trend ?? -Infinity) - (a.trend ?? -Infinity);
      case "season":
        return b.seasonAvg - a.seasonAvg;
      case "l3_vs_season":
        return (b.l3VsSeason ?? -Infinity) - (a.l3VsSeason ?? -Infinity);
      case "tp_rate_l3":
        return b.tpRateL3 - a.tpRateL3;
      case "l3_rank":
        return (a.l3AvgRank ?? Infinity) - (b.l3AvgRank ?? Infinity);
      case "consistency":
        return (a.l3StdDev ?? Infinity) - (b.l3StdDev ?? Infinity);
      case "targets_l3":
        return (b.l3Targets ?? 0) - (a.l3Targets ?? 0);
      case "touches_l3":
        return (b.l3Touches ?? 0) - (a.l3Touches ?? 0);
      case "yards_l3":
        return (b.l3Yards ?? 0) - (a.l3Yards ?? 0);
      case "ypt_l3":
        return (b.l3YardsPerTouch ?? -Infinity) - (a.l3YardsPerTouch ?? -Infinity);
      case "air_yards_l3":
        return (b.l3AirYards ?? 0) - (a.l3AirYards ?? 0);
      case "targets_delta":
        return (b.l3TargetsDelta ?? -Infinity) - (a.l3TargetsDelta ?? -Infinity);
      case "touches_delta":
        return (b.l3TouchesDelta ?? -Infinity) - (a.l3TouchesDelta ?? -Infinity);
      case "air_delta":
        return (b.l3AirYardsDelta ?? -Infinity) - (a.l3AirYardsDelta ?? -Infinity);
      case "target_share":
        return (b.l3TargetShare ?? -Infinity) - (a.l3TargetShare ?? -Infinity);
      case "air_share":
        return (b.l3AirShare ?? -Infinity) - (a.l3AirShare ?? -Infinity);
      case "wopr":
        return (b.l3Wopr ?? -Infinity) - (a.l3Wopr ?? -Infinity);
      case "racr":
        return (b.l3Racr ?? -Infinity) - (a.l3Racr ?? -Infinity);
      case "catch_rate":
        return (b.l3CatchRate ?? -Infinity) - (a.l3CatchRate ?? -Infinity);
      case "ypt":
        return (b.l3YardsPerTarget ?? -Infinity) - (a.l3YardsPerTarget ?? -Infinity);
      case "usage_score":
        return (b.usageScore ?? -Infinity) - (a.usageScore ?? -Infinity);
      case "usage_trend":
        return (b.usageTrendScore ?? -Infinity) - (a.usageTrendScore ?? -Infinity);
      case "usage_share":
        return (b.usageShareScore ?? -Infinity) - (a.usageShareScore ?? -Infinity);
      case "signal": {
        const aSignal = signalPriority[a.signal ?? "Neutral"] ?? 0;
        const bSignal = signalPriority[b.signal ?? "Neutral"] ?? 0;
        if (bSignal !== aSignal) return bSignal - aSignal;
        return (b.usageScore ?? -Infinity) - (a.usageScore ?? -Infinity);
      }
      case "cluster": {
        const aCluster = clusterPriority[a.usageCluster ?? "Medium"] ?? 0;
        const bCluster = clusterPriority[b.usageCluster ?? "Medium"] ?? 0;
        if (bCluster !== aCluster) return bCluster - aCluster;
        return (b.usageScore ?? -Infinity) - (a.usageScore ?? -Infinity);
      }
      case "home_l3":
        return (b.homeL3Avg ?? -Infinity) - (a.homeL3Avg ?? -Infinity);
      case "away_l3":
        return (b.awayL3Avg ?? -Infinity) - (a.awayL3Avg ?? -Infinity);
      case "home_avg":
        return (b.homeAvg ?? -Infinity) - (a.homeAvg ?? -Infinity);
      case "away_avg":
        return (b.awayAvg ?? -Infinity) - (a.awayAvg ?? -Infinity);
      case "home_vs_away":
        return (b.homeVsAway ?? -Infinity) - (a.homeVsAway ?? -Infinity);
      case "opp_delta":
        return (b.oppDelta ?? -Infinity) - (a.oppDelta ?? -Infinity);
      case "opp_rank":
        return (a.oppRank ?? Infinity) - (b.oppRank ?? Infinity);
      case "games":
        return b.games - a.games;
      case "price": {
        const priceA = a.token?.currentPriceUsdcRaw ? toUsdNumber(a.token.currentPriceUsdcRaw) : 0;
        const priceB = b.token?.currentPriceUsdcRaw ? toUsdNumber(b.token.currentPriceUsdcRaw) : 0;
        return priceB - priceA;
      }
      case "l3":
      default:
        return b.l3Avg - a.l3Avg;
    }
  });

  return (
    <NflPageShell
      title="NFL trending"
      description="L3 fantasy trends with positional ranks and opponent deltas."
    >
      <form className="mt-6 flex flex-wrap items-end gap-3" method="GET">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Presets</span>
          {PRESET_OPTIONS.map((preset) => (
            <Link
              key={preset.key}
              className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              href={`/nfl/trending${buildQuery({
                season: String(season),
                season_type: seasonType,
                week: String(viewWeek),
                lookback: String(lookback),
                rank_mode: rankMode,
                split_mode: splitMode,
                ...preset.params,
              })}`}
            >
              {preset.label}
            </Link>
          ))}
        </div>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Search
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Player name"
            className="mt-1 block w-48 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Season
          <select
            name="season"
            defaultValue={season}
            className="mt-1 block w-28 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            {SAMPLE_SEASONS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Type
          <select
            name="season_type"
            defaultValue={seasonType}
            className="mt-1 block w-24 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            {SEASON_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Week
          <select
            name="week"
            defaultValue={viewWeek}
            className="mt-1 block w-20 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            {weeks.map((wk) => (
              <option key={wk} value={wk}>
                {wk}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Lookback
          <input
            type="number"
            name="lookback"
            min={1}
            max={18}
            defaultValue={lookback}
            className="mt-1 block w-20 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Position
          <select
            name="position"
            defaultValue={positionFilter ?? ""}
            className="mt-1 block w-24 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            <option value="">All</option>
            {positions.map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Trend
          <select
            name="trend"
            defaultValue={trendFilter}
            className="mt-1 block w-24 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            {TREND_FILTERS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Home/Away
          <select
            name="home_away"
            defaultValue={homeAway}
            className="mt-1 block w-24 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            {HOME_AWAY_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Split mode
          <select
            name="split_mode"
            defaultValue={splitMode}
            className="mt-1 block w-28 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            {SPLIT_MODE_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Rank mode
          <select
            name="rank_mode"
            defaultValue={rankMode}
            className="mt-1 block w-28 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            {RANK_MODE_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Opponent
          <select
            name="opp"
            defaultValue={oppFilter ?? ""}
            className="mt-1 block w-24 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            <option value="">All</option>
            {opponentOptions.map((opp) => (
              <option key={opp} value={opp}>
                {opp}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Min games
          <input
            type="number"
            name="min_games"
            min={0}
            max={25}
            defaultValue={minGames || ""}
            className="mt-1 block w-24 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Min L3
          <input
            type="number"
            name="min_l3"
            min={0}
            step={0.1}
            defaultValue={minL3 || ""}
            className="mt-1 block w-24 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Min season
          <input
            type="number"
            name="min_season"
            min={0}
            step={0.1}
            defaultValue={minSeason || ""}
            className="mt-1 block w-28 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Min TP%
          <input
            type="number"
            name="min_tp_rate"
            min={0}
            max={100}
            step={1}
            defaultValue={minTpRate || ""}
            className="mt-1 block w-20 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Min targets
          <input
            type="number"
            name="min_targets"
            min={0}
            step={0.1}
            defaultValue={minTargets || ""}
            className="mt-1 block w-24 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Min touches
          <input
            type="number"
            name="min_touches"
            min={0}
            step={0.1}
            defaultValue={minTouches || ""}
            className="mt-1 block w-24 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Min air
          <input
            type="number"
            name="min_air"
            min={0}
            step={1}
            defaultValue={minAir || ""}
            className="mt-1 block w-24 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Min tgt share
          <input
            type="number"
            name="min_target_share"
            min={0}
            max={100}
            step={1}
            defaultValue={minTargetShare || ""}
            className="mt-1 block w-20 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Min air share
          <input
            type="number"
            name="min_air_share"
            min={0}
            max={100}
            step={1}
            defaultValue={minAirShare || ""}
            className="mt-1 block w-20 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Min WOPR
          <input
            type="number"
            name="min_wopr"
            min={0}
            max={1}
            step={0.01}
            defaultValue={minWopr || ""}
            className="mt-1 block w-20 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Min catch%
          <input
            type="number"
            name="min_catch"
            min={0}
            max={100}
            step={1}
            defaultValue={minCatch || ""}
            className="mt-1 block w-20 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Min Y/Tgt
          <input
            type="number"
            name="min_ypt"
            min={0}
            step={0.1}
            defaultValue={minYpt || ""}
            className="mt-1 block w-20 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Min usage
          <input
            type="number"
            name="min_usage"
            step={0.1}
            defaultValue={minUsage > -5 ? minUsage : ""}
            className="mt-1 block w-20 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Min usage trend
          <input
            type="number"
            name="min_usage_trend"
            step={0.1}
            defaultValue={minUsageTrend > -5 ? minUsageTrend : ""}
            className="mt-1 block w-24 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Min usage share
          <input
            type="number"
            name="min_usage_share"
            step={0.1}
            defaultValue={minUsageShare > -5 ? minUsageShare : ""}
            className="mt-1 block w-24 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            name="token_only"
            value="1"
            defaultChecked={tokenOnly}
            className="h-4 w-4 rounded border border-black/10 text-black dark:border-white/10 dark:text-white"
          />
          Token only
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Sort
          <select
            name="sort"
            defaultValue={sort}
            className="mt-1 block w-36 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md border border-black/10 bg-black px-4 py-2 text-sm text-white hover:bg-zinc-800 dark:border-white/10 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Apply
        </button>
      </form>

      <section className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Window: last {TREND_WEEKS} games within the last {lookback} weeks through week {viewWeek}. Rank mode:{" "}
          {rankMode === "all" ? "overall" : "position"}. Split mode: {splitMode}. Opp Δ compares opponent allowed vs league
          average over last {OPP_WINDOW_WEEKS} weeks. Consistency uses L3 standard deviation.
        </p>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Home/Away split</div>
          <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Using {windowWeeks.length} weeks of data. Home vs Away Δ highlights players with strong splits.
          </div>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Usage focus</div>
          <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            L3 Targets, Touches, Yards, Air Yards are per-game across the last {TREND_WEEKS} games. Usage Score is
            position-weighted (WR/TE emphasize air + share; RB emphasizes touches; QB emphasizes rushes). Signals are based
            on Usage Score + L3 vs Season.
          </div>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Filters</div>
          <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Use Min Games + Token only to focus on stable, tradable players.
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <table className="w-full min-w-[2700px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Games</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Signal</th>
                <th className="px-3 py-2">Cluster</th>
                <th className="px-3 py-2">Season FPPG</th>
                <th className="px-3 py-2">Home FPPG</th>
                <th className="px-3 py-2">Away FPPG</th>
                <th className="px-3 py-2">L3 Avg</th>
                <th className="px-3 py-2">Home L3</th>
                <th className="px-3 py-2">Away L3</th>
                <th className="px-3 py-2">Usage Score</th>
                <th className="px-3 py-2">Usage Trend</th>
                <th className="px-3 py-2">Usage Share</th>
                <th className="px-3 py-2">L3 Targets</th>
                <th className="px-3 py-2">L3 Touches</th>
                <th className="px-3 py-2">L3 Yards</th>
                <th className="px-3 py-2">Y/Tch</th>
                <th className="px-3 py-2">L3 Air</th>
                <th className="px-3 py-2">Tgt Δ</th>
                <th className="px-3 py-2">Touch Δ</th>
                <th className="px-3 py-2">Air Δ</th>
                <th className="px-3 py-2">Tgt%</th>
                <th className="px-3 py-2">Air%</th>
                <th className="px-3 py-2">WOPR</th>
                <th className="px-3 py-2">RACR</th>
                <th className="px-3 py-2">Catch%</th>
                <th className="px-3 py-2">Y/Tgt</th>
                <th className="px-3 py-2">L3 Std</th>
                <th className="px-3 py-2">L3 Floor</th>
                <th className="px-3 py-2">L3 Ceiling</th>
                <th className="px-3 py-2">Home/Away Δ</th>
                <th className="px-3 py-2">L3 Avg Rank</th>
                <th className="px-3 py-2">TP Rate L3</th>
                <th className="px-3 py-2">Trend Δ</th>
                <th className="px-3 py-2">L3 vs Season</th>
                <th className="px-3 py-2">Opp Δ</th>
                <th className="px-3 py-2">Opp Rank</th>
                <th className="px-3 py-2">H/A</th>
                <th className="px-3 py-2">Opp</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 75).map((row) => {
                return (
                  <tr key={row.playerId} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{row.playerName}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.position ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.games}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatUsd(row.token?.currentPriceUsdcRaw)}
                    </td>
                    <td
                      className={`px-3 py-2 ${
                        row.signal === "Surge"
                          ? "text-emerald-500"
                          : row.signal === "Breakout"
                            ? "text-sky-500"
                            : row.signal === "Fade"
                              ? "text-rose-500"
                              : "text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {row.signal ?? "Neutral"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.usageCluster ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatNumber(row.seasonAvg)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.homeAvg !== undefined ? formatNumber(row.homeAvg) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.awayAvg !== undefined ? formatNumber(row.awayAvg) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatNumber(row.l3Avg)}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.homeL3Avg !== undefined ? formatNumber(row.homeL3Avg) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.awayL3Avg !== undefined ? formatNumber(row.awayL3Avg) : "—"}
                    </td>
                    <td
                      className={`px-3 py-2 ${row.usageScore !== undefined && row.usageScore >= 0 ? "text-emerald-500" : "text-rose-500"}`}
                    >
                      {row.usageScore !== undefined ? row.usageScore.toFixed(2) : "—"}
                    </td>
                    <td
                      className={`px-3 py-2 ${row.usageTrendScore !== undefined && row.usageTrendScore >= 0 ? "text-emerald-500" : "text-rose-500"}`}
                    >
                      {row.usageTrendScore !== undefined ? row.usageTrendScore.toFixed(2) : "—"}
                    </td>
                    <td
                      className={`px-3 py-2 ${row.usageShareScore !== undefined && row.usageShareScore >= 0 ? "text-emerald-500" : "text-rose-500"}`}
                    >
                      {row.usageShareScore !== undefined ? row.usageShareScore.toFixed(2) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.l3Targets !== undefined ? formatNumber(row.l3Targets) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.l3Touches !== undefined ? formatNumber(row.l3Touches) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.l3Yards !== undefined ? formatNumber(row.l3Yards) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.l3YardsPerTouch !== undefined ? formatNumber(row.l3YardsPerTouch) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.l3AirYards !== undefined ? formatNumber(row.l3AirYards) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.l3TargetsDelta !== undefined ? formatNumber(row.l3TargetsDelta) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.l3TouchesDelta !== undefined ? formatNumber(row.l3TouchesDelta) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.l3AirYardsDelta !== undefined ? formatNumber(row.l3AirYardsDelta) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.l3TargetShare !== undefined ? formatPercent(row.l3TargetShare * 100) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.l3AirShare !== undefined ? formatPercent(row.l3AirShare * 100) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.l3Wopr !== undefined ? formatNumber(row.l3Wopr) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.l3Racr !== undefined ? formatNumber(row.l3Racr) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.l3CatchRate !== undefined ? formatPercent(row.l3CatchRate * 100) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.l3YardsPerTarget !== undefined ? formatNumber(row.l3YardsPerTarget) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.l3StdDev !== undefined ? formatNumber(row.l3StdDev) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.l3Floor !== undefined ? formatNumber(row.l3Floor) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.l3Ceiling !== undefined ? formatNumber(row.l3Ceiling) : "—"}
                    </td>
                    <td
                      className={`px-3 py-2 ${(row.homeVsAway ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"}`}
                    >
                      {row.homeVsAway !== undefined ? formatNumber(row.homeVsAway) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatRank(row.l3AvgRank)}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatPercent(row.tpRateL3 * 100)}
                    </td>
                    <td
                      className={`px-3 py-2 ${(row.trend ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"}`}
                    >
                      {row.trend !== undefined ? formatNumber(row.trend) : "—"}
                    </td>
                    <td
                      className={`px-3 py-2 ${(row.l3VsSeason ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"}`}
                    >
                      {row.l3VsSeason !== undefined ? formatNumber(row.l3VsSeason) : "—"}
                    </td>
                    <td
                      className={`px-3 py-2 ${(row.oppDelta ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"}`}
                    >
                      {row.oppDelta !== undefined ? formatNumber(row.oppDelta) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.oppRank ? `#${row.oppRank}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.lastHomeAway === "HOME" ? "H" : row.lastHomeAway === "AWAY" ? "A" : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.lastOpp ?? "—"}</td>
                  </tr>
                );
              })}
              {sorted.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={43}>
                    No players match the filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          L3 Avg Rank follows the selected rank mode. TP Rate L3 counts top‑finish weeks vs positional thresholds. Opp Rank
          is relative to position over the last {OPP_WINDOW_WEEKS} weeks. Prices come from Sport.fun tokens when a name
          match exists. Target/Air share and WOPR come from nflverse weekly stats. Usage Score is a position‑normalized mix
          of L3 usage deltas + share.
        </p>
      </section>
    </NflPageShell>
  );
}
