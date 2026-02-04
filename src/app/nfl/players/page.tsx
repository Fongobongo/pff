import Link from "next/link";
import NflPageShell from "../_components/NflPageShell";
import { getSportfunMarketSnapshot, toUsdNumber } from "@/lib/sportfunMarket";
import { fetchNflWeeklyStats, type NflWeeklyRow } from "@/lib/stats/nflverse";
import { scoreNfl } from "@/lib/stats/nfl";

const SAMPLE_SEASONS = [2021, 2022, 2023];
const SEASON_TYPES = ["REG", "POST", "PRE"] as const;
const VIEW_OPTIONS = [
  { key: "season", label: "Season stats" },
  { key: "weekly", label: "Weekly stats" },
] as const;

const PAGE_SIZE = 50;

const TOP_THRESHOLDS: Record<string, number> = {
  QB: 12,
  RB: 24,
  WR: 24,
  TE: 12,
  K: 12,
  DST: 12,
};

const SEASON_SORT_OPTIONS = [
  { key: "fpts", label: "FPts" },
  { key: "fppg", label: "FPPG" },
  { key: "l3", label: "L3 Avg" },
  { key: "avg_rank", label: "Avg Rank" },
  { key: "tp_rate", label: "TP Rate" },
  { key: "tp_total", label: "TP Total" },
  { key: "price", label: "Price" },
] as const;

const WEEKLY_SORT_OPTIONS = [
  { key: "week_score", label: "Week FPts" },
  { key: "week_rank", label: "Week Rank" },
  { key: "l3", label: "L3 Avg" },
  { key: "avg_rank", label: "Avg Rank" },
  { key: "tp_rate", label: "TP Rate" },
  { key: "price", label: "Price" },
] as const;

const DEFAULT_SORT: Record<string, string> = {
  season: "fppg",
  weekly: "week_score",
};

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
};

type PlayerAgg = {
  playerId: string;
  playerName: string;
  position?: string;
  team?: string;
  games: number;
  total: number;
  l3Avg: number;
  avgRank?: number;
  tpCount: number;
  tpRate: number;
  weekScore?: number;
  weekRank?: number;
  weeks: WeekScore[];
  token?: TokenInfo;
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

function buildQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
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

export default async function NflPlayersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    sort?: string;
    page?: string;
    position?: string;
    view?: string;
    season?: string;
    week?: string;
    season_type?: string;
  }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim().toLowerCase() ?? "";
  const view = VIEW_OPTIONS.find((opt) => opt.key === params.view)?.key ?? "season";
  const season = parseNumber(params.season, 2023, 1999, 2099);
  const seasonType = (params.season_type ?? "REG").toUpperCase();
  const sortOptions = view === "weekly" ? WEEKLY_SORT_OPTIONS : SEASON_SORT_OPTIONS;
  const sort = sortOptions.find((opt) => opt.key === params.sort)?.key ?? DEFAULT_SORT[view];
  const page = parseNumber(params.page, 1, 1, 9999);
  const positionFilter = params.position?.toUpperCase();

  const [snapshot, weeklyData] = await Promise.all([
    getSportfunMarketSnapshot({ sport: "nfl", windowHours: 24, trendDays: 30, maxTokens: 500 }),
    fetchNflWeeklyStats({ season, seasonType }),
  ]);

  const tokens: TokenInfo[] = snapshot.tokens.map((token) => ({
    tokenIdDec: token.tokenIdDec,
    name: token.name,
    currentPriceUsdcRaw: token.currentPriceUsdcRaw,
    priceChange24hPercent: token.priceChange24hPercent,
  }));

  const tokenIndex = buildTokenIndex(tokens);

  const weeks = Array.from(new Set(weeklyData.rows.map((row) => row.week).filter(Boolean))).sort(
    (a, b) => a - b
  );
  const latestWeek = weeks.length ? weeks[weeks.length - 1] : 1;
  const selectedWeek = parseNumber(params.week, latestWeek, 1, 25);
  const viewWeek = weeks.includes(selectedWeek) ? selectedWeek : latestWeek;

  const analysisRows =
    view === "weekly"
      ? weeklyData.rows.filter((row) => row.week <= viewWeek)
      : weeklyData.rows;

  const scores = new Map<string, number>();
  for (const row of analysisRows) {
    const score = scoreNfl(row.stats).totalRounded ?? 0;
    scores.set(`${row.player_id}:${row.week}`, score);
  }

  const { weekRanks, weekPosRanks } = groupWeeks(analysisRows, scores);

  const players = new Map<string, PlayerAgg>();

  for (const row of analysisRows) {
    if (!row.player_id) continue;
    const playerName = row.player_display_name || row.player_name || row.player_id;
    const entry = players.get(row.player_id) ?? {
      playerId: row.player_id,
      playerName,
      position: row.position,
      team: row.team,
      games: 0,
      total: 0,
      l3Avg: 0,
      tpCount: 0,
      tpRate: 0,
      weeks: [],
      token: tokenIndex.get(normalizeName(playerName)),
    };

    const score = scores.get(`${row.player_id}:${row.week}`) ?? 0;
    entry.games += 1;
    entry.total += score;

    const rank = row.week ? weekRanks.get(row.week)?.get(row.player_id) : undefined;
    const posRank = row.week
      ? weekPosRanks.get(row.week)?.get((row.position ?? "UNK").toUpperCase())?.get(row.player_id)
      : undefined;

    if (row.week) {
      entry.weeks.push({ week: row.week, score, rank, posRank });
    }

    players.set(row.player_id, entry);
  }

  const rows: PlayerAgg[] = Array.from(players.values()).map((entry) => {
    entry.weeks.sort((a, b) => a.week - b.week);
    const last3 = entry.weeks.slice(-3);
    entry.l3Avg = last3.length
      ? last3.reduce((acc, val) => acc + val.score, 0) / last3.length
      : 0;

    const rankValues = entry.weeks.map((w) => w.rank).filter((v): v is number => Boolean(v));
    entry.avgRank = rankValues.length
      ? rankValues.reduce((acc, val) => acc + val, 0) / rankValues.length
      : undefined;

    const pos = (entry.position ?? "UNK").toUpperCase();
    const threshold = TOP_THRESHOLDS[pos] ?? 24;
    entry.tpCount = entry.weeks.filter((w) => w.posRank && w.posRank <= threshold).length;
    entry.tpRate = entry.games ? entry.tpCount / entry.games : 0;

    if (view === "weekly") {
      const weekRow = entry.weeks.find((w) => w.week === viewWeek);
      entry.weekScore = weekRow?.score;
      entry.weekRank = weekRow?.rank;
    }

    return entry;
  });

  const positions = Array.from(
    new Set(rows.map((row) => row.position).filter((value): value is string => Boolean(value)))
  ).sort();

  let filtered = rows;

  if (positionFilter) {
    filtered = filtered.filter((row) => (row.position ?? "").toUpperCase() === positionFilter);
  }

  if (q) {
    filtered = filtered.filter((row) => {
      const tokenId = row.token?.tokenIdDec ?? "";
      return (
        row.playerName.toLowerCase().includes(q) ||
        row.playerId.toLowerCase().includes(q) ||
        tokenId.includes(q)
      );
    });
  }

  const sorted = filtered.slice().sort((a, b) => {
    switch (sort) {
      case "fpts":
        return b.total - a.total;
      case "fppg":
        return b.total / Math.max(1, b.games) - a.total / Math.max(1, a.games);
      case "l3":
        return b.l3Avg - a.l3Avg;
      case "avg_rank":
        return (a.avgRank ?? Infinity) - (b.avgRank ?? Infinity);
      case "tp_rate":
        return b.tpRate - a.tpRate;
      case "tp_total":
        return b.tpCount - a.tpCount;
      case "price": {
        const priceA = a.token?.currentPriceUsdcRaw ? toUsdNumber(a.token.currentPriceUsdcRaw) : 0;
        const priceB = b.token?.currentPriceUsdcRaw ? toUsdNumber(b.token.currentPriceUsdcRaw) : 0;
        return priceB - priceA;
      }
      case "week_rank":
        return (a.weekRank ?? Infinity) - (b.weekRank ?? Infinity);
      case "week_score":
        return (b.weekScore ?? 0) - (a.weekScore ?? 0);
      default:
        return b.total - a.total;
    }
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <NflPageShell title="NFL players" description="Season and weekly fantasy leaders with Sport.fun pricing.">
      <form className="mt-6 flex flex-wrap items-end gap-3" method="GET">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Search
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Player name or token ID"
            className="mt-1 block w-56 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          View
          <select
            name="view"
            defaultValue={view}
            className="mt-1 block w-40 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            {VIEW_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
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
        {view === "weekly" ? (
          <label className="text-xs text-zinc-600 dark:text-zinc-400">
            Week
            <select
              name="week"
              defaultValue={viewWeek}
              className="mt-1 block w-24 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
            >
              {weeks.map((wk) => (
                <option key={wk} value={wk}>
                  {wk}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Position
          <select
            name="position"
            defaultValue={positionFilter ?? ""}
            className="mt-1 block w-28 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
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
          Sort
          <select
            name="sort"
            defaultValue={sort}
            className="mt-1 block w-36 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            {sortOptions.map((opt) => (
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
          Showing {pageRows.length} of {filtered.length} players · page {safePage} / {totalPages}. TP Rate = share
          of weeks finishing inside positional top {TOP_THRESHOLDS.QB}/{TOP_THRESHOLDS.RB}/{TOP_THRESHOLDS.WR}/
          {TOP_THRESHOLDS.TE}.
        </p>
      </section>

      <section className="mt-8">
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Δ (24h)</th>
                {view === "weekly" ? (
                  <>
                    <th className="px-3 py-2">Week FPts</th>
                    <th className="px-3 py-2">Week Rank</th>
                  </>
                ) : (
                  <>
                    <th className="px-3 py-2">FPts</th>
                    <th className="px-3 py-2">FPPG</th>
                  </>
                )}
                <th className="px-3 py-2">L3 Avg</th>
                <th className="px-3 py-2">Avg Rank</th>
                <th className="px-3 py-2">TP Rate</th>
                <th className="px-3 py-2">TP Total</th>
                <th className="px-3 py-2">TP/Price</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => {
                const priceValue = row.token?.currentPriceUsdcRaw
                  ? toUsdNumber(row.token.currentPriceUsdcRaw)
                  : undefined;
                const tpPerPrice = priceValue ? row.tpCount / priceValue : undefined;
                return (
                  <tr key={row.playerId} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{row.playerName}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.position ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatUsd(row.token?.currentPriceUsdcRaw)}
                    </td>
                    <td
                      className={`px-3 py-2 ${(row.token?.priceChange24hPercent ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"}`}
                    >
                      {formatPercent(row.token?.priceChange24hPercent)}
                    </td>
                    {view === "weekly" ? (
                      <>
                        <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                          {formatNumber(row.weekScore, 2)}
                        </td>
                        <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatRank(row.weekRank)}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatNumber(row.total, 2)}</td>
                        <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                          {formatNumber(row.total / Math.max(1, row.games), 2)}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatNumber(row.l3Avg, 2)}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatRank(row.avgRank)}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatPercent(row.tpRate * 100)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.tpCount}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {tpPerPrice !== undefined ? tpPerPrice.toFixed(2) : "—"}
                    </td>
                  </tr>
                );
              })}
              {pageRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={12}>
                    No players match the filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 flex flex-wrap gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        {Array.from({ length: totalPages }, (_, idx) => idx + 1).slice(0, 8).map((p) => (
          <Link
            key={p}
            className={p === safePage ? "text-black dark:text-white" : "hover:underline"}
            href={`/nfl/players${buildQuery({
              q: params.q,
              sort,
              page: String(p),
              position: positionFilter ?? undefined,
              view,
              season: String(season),
              week: view === "weekly" ? String(viewWeek) : undefined,
              season_type: seasonType,
            })}`}
          >
            {p}
          </Link>
        ))}
        {totalPages > 8 ? <span>…</span> : null}
      </section>
    </NflPageShell>
  );
}
