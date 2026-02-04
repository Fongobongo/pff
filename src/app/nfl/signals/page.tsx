import Link from "next/link";
import NflPageShell from "../_components/NflPageShell";
import { getSportfunMarketSnapshot, toUsdNumber } from "@/lib/sportfunMarket";
import { fetchNflWeeklyStats, type NflWeeklyRow } from "@/lib/stats/nflverse";
import { scoreNfl } from "@/lib/stats/nfl";

const SAMPLE_SEASONS = [2021, 2022, 2023];
const SEASON_TYPES = ["REG", "POST", "PRE"] as const;
const TREND_WEEKS = 3;
const DEFAULT_LOOKBACK_WEEKS = 8;

const SIGNAL_FILTERS = [
  { key: "all", label: "All" },
  { key: "Surge", label: "Surge" },
  { key: "Breakout", label: "Breakout" },
  { key: "Fade", label: "Fade" },
] as const;

const SORT_OPTIONS = [
  { key: "signal", label: "Signal" },
  { key: "usage_score", label: "Usage Score" },
  { key: "l3_vs_season", label: "L3 vs Season" },
  { key: "l3_avg", label: "L3 Avg" },
  { key: "season_avg", label: "Season Avg" },
  { key: "trend", label: "Trend Δ" },
  { key: "targets_delta", label: "Targets Δ" },
  { key: "touches_delta", label: "Touches Δ" },
  { key: "air_delta", label: "Air Δ" },
  { key: "target_share", label: "Target Share" },
  { key: "air_share", label: "Air Share" },
  { key: "wopr", label: "WOPR" },
  { key: "price", label: "Price" },
] as const;

type TokenInfo = {
  tokenIdDec: string;
  name?: string;
  currentPriceUsdcRaw?: string;
  priceChange24hPercent?: number;
};

type WeekUsage = {
  week: number;
  score: number;
  usage?: NflWeeklyRow["usage"];
};

type SignalRow = {
  playerId: string;
  playerName: string;
  position?: string;
  team?: string;
  games: number;
  seasonAvg: number;
  l3Avg: number;
  l3VsSeason?: number;
  trend?: number;
  l3Targets?: number;
  l3Touches?: number;
  l3Air?: number;
  l3TargetsDelta?: number;
  l3TouchesDelta?: number;
  l3AirDelta?: number;
  l3TargetShare?: number;
  l3AirShare?: number;
  l3Wopr?: number;
  usageScore?: number;
  usageTrendScore?: number;
  usageShareScore?: number;
  signal?: "Surge" | "Breakout" | "Fade" | "Neutral";
  token?: TokenInfo;
  weeks: WeekUsage[];
};

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

function formatNumber(value?: number, decimals = 2): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(decimals);
}

function formatPercent(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
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

export default async function NflSignalsPage({
  searchParams,
}: {
  searchParams: Promise<{
    season?: string;
    week?: string;
    season_type?: string;
    position?: string;
    signal?: string;
    lookback?: string;
    min_usage?: string;
    min_l3?: string;
    min_season?: string;
    sort?: string;
  }>;
}) {
  const params = await searchParams;
  const season = parseNumber(params.season, 2023, 1999, 2099);
  const seasonType = (params.season_type ?? "REG").toUpperCase();
  const positionFilter = params.position?.toUpperCase();
  const signalFilter = SIGNAL_FILTERS.find((opt) => opt.key === params.signal)?.key ?? "all";
  const lookback = parseNumber(params.lookback, DEFAULT_LOOKBACK_WEEKS, 1, 18);
  const minUsage = parseNumber(params.min_usage, -5, -10, 10);
  const minL3 = parseNumber(params.min_l3, 0, 0, 100);
  const minSeason = parseNumber(params.min_season, 0, 0, 100);
  const sort = SORT_OPTIONS.find((opt) => opt.key === params.sort)?.key ?? "signal";

  const [snapshot, weeklyData] = await Promise.all([
    getSportfunMarketSnapshot({ sport: "nfl", windowHours: 24, trendDays: 30, maxTokens: 500 }),
    fetchNflWeeklyStats({ season, seasonType }),
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

  const tokenIndex = buildTokenIndex(
    snapshot.tokens.map((token) => ({
      tokenIdDec: token.tokenIdDec,
      name: token.name,
      currentPriceUsdcRaw: token.currentPriceUsdcRaw,
      priceChange24hPercent: token.priceChange24hPercent,
    }))
  );

  const players = new Map<string, SignalRow>();

  for (const row of analysisRows) {
    if (!row.player_id) continue;
    const playerName = row.player_display_name || row.player_name || row.player_id;
    const entry = players.get(row.player_id) ?? {
      playerId: row.player_id,
      playerName,
      position: row.position,
      team: row.team,
      games: 0,
      seasonAvg: 0,
      l3Avg: 0,
      weeks: [],
      token: tokenIndex.get(normalizeName(playerName)),
    };

    const score = scoreNfl(row.stats).totalRounded ?? 0;
    if (row.week) {
      entry.weeks.push({
        week: row.week,
        score,
        usage: row.usage,
      });
    }
    players.set(row.player_id, entry);
  }

  const rows: SignalRow[] = Array.from(players.values()).map((entry) => {
    entry.weeks.sort((a, b) => a.week - b.week);
    const last3 = entry.weeks.slice(-TREND_WEEKS);
    const prev3 = entry.weeks.slice(-TREND_WEEKS * 2, -TREND_WEEKS);
    const total = entry.weeks.reduce((acc, val) => acc + val.score, 0);
    entry.games = entry.weeks.length;
    entry.seasonAvg = entry.games ? total / entry.games : 0;
    entry.l3Avg = last3.length ? last3.reduce((acc, val) => acc + val.score, 0) / last3.length : 0;
    entry.l3VsSeason = entry.l3Avg - entry.seasonAvg;

    const l3TargetsTotal = last3.reduce((acc, w) => acc + (w.usage?.targets ?? 0), 0);
    const l3CarriesTotal = last3.reduce((acc, w) => acc + (w.usage?.carries ?? 0), 0);
    const l3ReceptionsTotal = last3.reduce((acc, w) => acc + (w.usage?.receptions ?? 0), 0);
    const l3AirYardsTotal = last3.reduce((acc, w) => acc + (w.usage?.airYards ?? 0), 0);
    const l3TargetShareTotal = last3.reduce((acc, w) => acc + (w.usage?.targetShare ?? 0), 0);
    const l3AirShareTotal = last3.reduce((acc, w) => acc + (w.usage?.airYardsShare ?? 0), 0);
    const l3WoprTotal = last3.reduce((acc, w) => acc + (w.usage?.wopr ?? 0), 0);
    const touchesTotal = l3CarriesTotal + l3ReceptionsTotal;
    const l3Count = last3.length;

    entry.l3Targets = l3Count ? l3TargetsTotal / l3Count : 0;
    entry.l3Touches = l3Count ? touchesTotal / l3Count : 0;
    entry.l3Air = l3Count ? l3AirYardsTotal / l3Count : 0;
    entry.l3TargetShare = l3Count ? l3TargetShareTotal / l3Count : undefined;
    entry.l3AirShare = l3Count ? l3AirShareTotal / l3Count : undefined;
    entry.l3Wopr = l3Count ? l3WoprTotal / l3Count : undefined;

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
    entry.l3AirDelta = entry.l3Air - prevAirAvg;

    const prevAvg = prev3.length ? prev3.reduce((acc, val) => acc + val.score, 0) / prev3.length : undefined;
    entry.trend = prevAvg !== undefined ? entry.l3Avg - prevAvg : undefined;

    return entry;
  });

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
    if (row.l3AirDelta !== undefined) entry.airDelta.push(row.l3AirDelta);
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
    usageStatsByPos.set(pos, {
      targetsDelta: { mean: average(entry.targetsDelta) ?? 0, std: standardDeviation(entry.targetsDelta) ?? 0 },
      touchesDelta: { mean: average(entry.touchesDelta) ?? 0, std: standardDeviation(entry.touchesDelta) ?? 0 },
      airDelta: { mean: average(entry.airDelta) ?? 0, std: standardDeviation(entry.airDelta) ?? 0 },
      targetShare: { mean: average(entry.targetShare) ?? 0, std: standardDeviation(entry.targetShare) ?? 0 },
      airShare: { mean: average(entry.airShare) ?? 0, std: standardDeviation(entry.airShare) ?? 0 },
      wopr: { mean: average(entry.wopr) ?? 0, std: standardDeviation(entry.wopr) ?? 0 },
    });
  }

  for (const row of rows) {
    const pos = (row.position ?? "UNK").toUpperCase();
    const stats = usageStatsByPos.get(pos);
    if (!stats) continue;
    const zTargets = zScore(row.l3TargetsDelta, stats.targetsDelta.mean, stats.targetsDelta.std);
    const zTouches = zScore(row.l3TouchesDelta, stats.touchesDelta.mean, stats.touchesDelta.std);
    const zAir = zScore(row.l3AirDelta, stats.airDelta.mean, stats.airDelta.std);
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

    const usageScoreVal = row.usageScore ?? 0;
    const l3Delta = row.l3VsSeason ?? 0;
    if (usageScoreVal >= 1.2 && l3Delta >= 3) {
      row.signal = "Surge";
    } else if (usageScoreVal >= 0.6 && l3Delta >= 1.5) {
      row.signal = "Breakout";
    } else if (usageScoreVal <= -0.6 && l3Delta <= -1.5) {
      row.signal = "Fade";
    } else {
      row.signal = "Neutral";
    }
  }

  const positions = Array.from(
    new Set(rows.map((row) => row.position).filter((value): value is string => Boolean(value)))
  ).sort();

  let filtered = rows;

  if (positionFilter) {
    filtered = filtered.filter((row) => (row.position ?? "").toUpperCase() === positionFilter);
  }

  if (signalFilter !== "all") {
    filtered = filtered.filter((row) => row.signal === signalFilter);
  }

  if (minUsage > -5) {
    filtered = filtered.filter((row) => (row.usageScore ?? -Infinity) >= minUsage);
  }

  if (minL3 > 0) {
    filtered = filtered.filter((row) => row.l3Avg >= minL3);
  }

  if (minSeason > 0) {
    filtered = filtered.filter((row) => row.seasonAvg >= minSeason);
  }

  const signalPriority: Record<string, number> = {
    Surge: 3,
    Breakout: 2,
    Neutral: 1,
    Fade: 0,
  };

  const sorted = filtered.slice().sort((a, b) => {
    switch (sort) {
      case "usage_score":
        return (b.usageScore ?? -Infinity) - (a.usageScore ?? -Infinity);
      case "l3_vs_season":
        return (b.l3VsSeason ?? -Infinity) - (a.l3VsSeason ?? -Infinity);
      case "l3_avg":
        return b.l3Avg - a.l3Avg;
      case "season_avg":
        return b.seasonAvg - a.seasonAvg;
      case "trend":
        return (b.trend ?? -Infinity) - (a.trend ?? -Infinity);
      case "targets_delta":
        return (b.l3TargetsDelta ?? -Infinity) - (a.l3TargetsDelta ?? -Infinity);
      case "touches_delta":
        return (b.l3TouchesDelta ?? -Infinity) - (a.l3TouchesDelta ?? -Infinity);
      case "air_delta":
        return (b.l3AirDelta ?? -Infinity) - (a.l3AirDelta ?? -Infinity);
      case "target_share":
        return (b.l3TargetShare ?? -Infinity) - (a.l3TargetShare ?? -Infinity);
      case "air_share":
        return (b.l3AirShare ?? -Infinity) - (a.l3AirShare ?? -Infinity);
      case "wopr":
        return (b.l3Wopr ?? -Infinity) - (a.l3Wopr ?? -Infinity);
      case "price": {
        const priceA = a.token?.currentPriceUsdcRaw ? toUsdNumber(a.token.currentPriceUsdcRaw) : 0;
        const priceB = b.token?.currentPriceUsdcRaw ? toUsdNumber(b.token.currentPriceUsdcRaw) : 0;
        return priceB - priceA;
      }
      case "signal":
      default: {
        const aSignal = signalPriority[a.signal ?? "Neutral"] ?? 0;
        const bSignal = signalPriority[b.signal ?? "Neutral"] ?? 0;
        if (bSignal !== aSignal) return bSignal - aSignal;
        return (b.usageScore ?? -Infinity) - (a.usageScore ?? -Infinity);
      }
    }
  });

  return (
    <NflPageShell title="NFL signals" description="Usage + production signals from the last 3 games.">
      <form className="mt-6 flex flex-wrap items-end gap-3" method="GET">
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
          Signal
          <select
            name="signal"
            defaultValue={signalFilter}
            className="mt-1 block w-28 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            {SIGNAL_FILTERS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
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
          Min L3
          <input
            type="number"
            name="min_l3"
            step={0.1}
            defaultValue={minL3 || ""}
            className="mt-1 block w-20 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Min season
          <input
            type="number"
            name="min_season"
            step={0.1}
            defaultValue={minSeason || ""}
            className="mt-1 block w-24 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Sort
          <select
            name="sort"
            defaultValue={sort}
            className="mt-1 block w-32 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
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
          Signals blend position-normalized usage changes with L3 vs season scoring. Window uses the last {lookback} weeks
          through week {viewWeek}.
        </p>
      </section>

      <section className="mt-8">
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <table className="w-full min-w-[1500px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Signal</th>
                <th className="px-3 py-2">Usage</th>
                <th className="px-3 py-2">L3 Avg</th>
                <th className="px-3 py-2">Season Avg</th>
                <th className="px-3 py-2">L3 vs Season</th>
                <th className="px-3 py-2">Trend Δ</th>
                <th className="px-3 py-2">Targets Δ</th>
                <th className="px-3 py-2">Touches Δ</th>
                <th className="px-3 py-2">Air Δ</th>
                <th className="px-3 py-2">Tgt%</th>
                <th className="px-3 py-2">Air%</th>
                <th className="px-3 py-2">WOPR</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 60).map((row) => (
                <tr key={row.playerId} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.playerName}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.position ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
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
                  <td
                    className={`px-3 py-2 ${row.usageScore !== undefined && row.usageScore >= 0 ? "text-emerald-500" : "text-rose-500"}`}
                  >
                    {row.usageScore !== undefined ? row.usageScore.toFixed(2) : "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatNumber(row.l3Avg)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatNumber(row.seasonAvg)}</td>
                  <td
                    className={`px-3 py-2 ${(row.l3VsSeason ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"}`}
                  >
                    {row.l3VsSeason !== undefined ? formatNumber(row.l3VsSeason) : "—"}
                  </td>
                  <td
                    className={`px-3 py-2 ${(row.trend ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"}`}
                  >
                    {row.trend !== undefined ? formatNumber(row.trend) : "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {row.l3TargetsDelta !== undefined ? formatNumber(row.l3TargetsDelta) : "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {row.l3TouchesDelta !== undefined ? formatNumber(row.l3TouchesDelta) : "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {row.l3AirDelta !== undefined ? formatNumber(row.l3AirDelta) : "—"}
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
                </tr>
              ))}
              {sorted.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={16}>
                    No signals match the filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </NflPageShell>
  );
}
