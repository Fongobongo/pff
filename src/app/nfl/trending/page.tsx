import Link from "next/link";
import NflPageShell from "../_components/NflPageShell";
import { getSportfunMarketSnapshot, toUsdNumber } from "@/lib/sportfunMarket";
import { fetchNflWeeklyStats, type NflWeeklyRow } from "@/lib/stats/nflverse";
import { scoreNfl } from "@/lib/stats/nfl";

const SAMPLE_SEASONS = [2021, 2022, 2023];
const SEASON_TYPES = ["REG", "POST", "PRE"] as const;
const TREND_WEEKS = 3;
const OPP_WINDOW_WEEKS = 6;

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

const SORT_OPTIONS = [
  { key: "l3", label: "L3 Avg FPts" },
  { key: "trend", label: "Trend Δ" },
  { key: "tp_rate_l3", label: "TP Rate L3" },
  { key: "l3_rank", label: "L3 Avg Rank" },
  { key: "opp_delta", label: "Opp Δ" },
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
};

type TrendRow = {
  playerId: string;
  playerName: string;
  position?: string;
  team?: string;
  l3Avg: number;
  l3AvgRank?: number;
  tpRateL3: number;
  trend?: number;
  oppDelta?: number;
  lastOpp?: string;
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

  const analysisRows = weeklyData.rows.filter((row) => row.week <= viewWeek);

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

  const oppWindowStart = Math.max(1, viewWeek - OPP_WINDOW_WEEKS + 1);
  const oppRows = analysisRows.filter((row) => row.week >= oppWindowStart);
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

  const players = new Map<string, TrendRow>();

  for (const row of analysisRows) {
    if (!row.player_id) continue;
    const playerName = row.player_display_name || row.player_name || row.player_id;
    const entry = players.get(row.player_id) ?? {
      playerId: row.player_id,
      playerName,
      position: row.position,
      team: row.team,
      l3Avg: 0,
      l3AvgRank: undefined,
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
      entry.weeks.push({
        week: row.week,
        score,
        rank,
        posRank,
        opponent: row.opponent_team?.toUpperCase(),
      });
    }

    players.set(row.player_id, entry);
  }

  const rows: TrendRow[] = Array.from(players.values()).map((entry) => {
    entry.weeks.sort((a, b) => a.week - b.week);
    const lastOpp = entry.weeks.length ? entry.weeks[entry.weeks.length - 1].opponent : undefined;
    const last3 = entry.weeks.slice(-TREND_WEEKS);
    const prev3 = entry.weeks.slice(-TREND_WEEKS * 2, -TREND_WEEKS);

    entry.l3Avg = last3.length ? last3.reduce((acc, val) => acc + val.score, 0) / last3.length : 0;
    const l3RankValues = last3.map((w) => w.posRank).filter((v): v is number => Boolean(v));
    entry.l3AvgRank = l3RankValues.length
      ? l3RankValues.reduce((acc, val) => acc + val, 0) / l3RankValues.length
      : undefined;

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
    }

    return entry;
  });

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

  const sorted = filtered.slice().sort((a, b) => {
    switch (sort) {
      case "trend":
        return (b.trend ?? -Infinity) - (a.trend ?? -Infinity);
      case "tp_rate_l3":
        return b.tpRateL3 - a.tpRateL3;
      case "l3_rank":
        return (a.l3AvgRank ?? Infinity) - (b.l3AvgRank ?? Infinity);
      case "opp_delta":
        return (b.oppDelta ?? -Infinity) - (a.oppDelta ?? -Infinity);
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
          Window: last {TREND_WEEKS} games through week {viewWeek}. Opp Δ compares opponent allowed vs league
          average over last {OPP_WINDOW_WEEKS} weeks.
        </p>
      </section>

      <section className="mt-8">
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">L3 Avg</th>
                <th className="px-3 py-2">L3 Avg Rank</th>
                <th className="px-3 py-2">TP Rate L3</th>
                <th className="px-3 py-2">Trend Δ</th>
                <th className="px-3 py-2">Opp Δ</th>
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
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatUsd(row.token?.currentPriceUsdcRaw)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatNumber(row.l3Avg)}</td>
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
                      className={`px-3 py-2 ${(row.oppDelta ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"}`}
                    >
                      {row.oppDelta !== undefined ? formatNumber(row.oppDelta) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.lastOpp ?? "—"}</td>
                  </tr>
                );
              })}
              {sorted.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={10}>
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
          L3 Avg Rank uses positional ranks. TP Rate L3 counts top‑finish weeks vs positional thresholds. Prices come from
          Sport.fun tokens when a name match exists.
        </p>
      </section>
    </NflPageShell>
  );
}
