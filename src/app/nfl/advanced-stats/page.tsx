import Link from "next/link";
import NflPageShell from "../_components/NflPageShell";
import { fetchNflWeeklyStats, type NflWeeklyRow } from "@/lib/stats/nflverse";
import { scoreNfl } from "@/lib/stats/nfl";

const SAMPLE_SEASONS = [2021, 2022, 2023];
const SEASON_TYPES = ["REG", "POST", "PRE"] as const;
const TAB_OPTIONS = [
  { key: "efficiency", label: "Efficiency" },
  { key: "volume", label: "Volume" },
  { key: "redzone", label: "Red Zone" },
  { key: "advanced", label: "Advanced" },
  { key: "tournament", label: "Tournament" },
] as const;

const DEFAULT_LOOKBACK_WEEKS = 6;
const LOOKBACK_OPTIONS = [3, 4, 6, 8, 10, 12, 14, 16, 18];

function buildQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

function toNumber(value: number | undefined): number {
  return Number(value ?? 0) || 0;
}

function parseNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((acc, val) => acc + val, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (!values.length) return 0;
  const mean = average(values);
  const variance = values.reduce((acc, val) => acc + (val - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function formatDecimal(value: number | undefined, digits = 2): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

function formatPercent(value: number | undefined, digits = 1): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export default async function NflAdvancedStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; week?: string; season_type?: string; tab?: string; lookback?: string }>;
}) {
  const params = await searchParams;
  const rawSeason = Number(params.season ?? "2023");
  const season = Number.isFinite(rawSeason) ? rawSeason : 2023;
  const seasonType = (params.season_type ?? "REG").toUpperCase();
  const rawWeek = params.week ? Number(params.week) : undefined;
  const requestedWeek = rawWeek !== undefined && Number.isFinite(rawWeek) ? rawWeek : undefined;
  const tab = TAB_OPTIONS.find((opt) => opt.key === params.tab)?.key ?? "efficiency";
  const lookback = parseNumber(params.lookback, DEFAULT_LOOKBACK_WEEKS, 3, 18);

  const weeklyData = await fetchNflWeeklyStats({ season, seasonType });
  const weeks = Array.from(new Set(weeklyData.rows.map((row) => row.week).filter(Boolean))).sort(
    (a, b) => a - b
  );
  const latestWeek = weeks.length ? weeks[weeks.length - 1] : 1;
  const week = requestedWeek && weeks.includes(requestedWeek) ? requestedWeek : latestWeek;

  const weekRows = weeklyData.rows.filter((row) => row.week === week);
  const seasonRows = weeklyData.rows.filter((row) => row.week && row.week <= week);

  const getTargets = (row: NflWeeklyRow) => row.usage?.targets ?? 0;
  const getReceptions = (row: NflWeeklyRow) => row.usage?.receptions ?? 0;
  const getCarries = (row: NflWeeklyRow) => row.usage?.carries ?? 0;
  const getTouches = (row: NflWeeklyRow) => getCarries(row) + getReceptions(row);
  const getAirYards = (row: NflWeeklyRow) => row.usage?.airYards ?? 0;
  const getRecYards = (row: NflWeeklyRow) =>
    row.usage?.receivingYards ?? toNumber(row.stats?.receiving_yards);
  const getRushYards = (row: NflWeeklyRow) =>
    row.usage?.rushingYards ?? toNumber(row.stats?.rushing_yards);
  const getPassYards = (row: NflWeeklyRow) =>
    row.usage?.passingYards ?? toNumber(row.stats?.passing_yards);
  const getCatchRate = (row: NflWeeklyRow) => {
    const targets = getTargets(row);
    if (!targets) return undefined;
    return getReceptions(row) / targets;
  };
  const getYpt = (row: NflWeeklyRow) => {
    const targets = getTargets(row);
    if (!targets) return undefined;
    return getRecYards(row) / targets;
  };
  const getYpr = (row: NflWeeklyRow) => {
    const receptions = getReceptions(row);
    if (!receptions) return undefined;
    return getRecYards(row) / receptions;
  };
  const getYptTouch = (row: NflWeeklyRow) => {
    const touches = getTouches(row);
    if (!touches) return undefined;
    return (getRushYards(row) + getRecYards(row)) / touches;
  };
  const getTdTotal = (row: NflWeeklyRow) =>
    toNumber(row.stats?.passing_td) + toNumber(row.stats?.rushing_td) + toNumber(row.stats?.receiving_td);

  const topTargets = weekRows.slice().sort((a, b) => getTargets(b) - getTargets(a)).slice(0, 10);
  const topTouches = weekRows.slice().sort((a, b) => getTouches(b) - getTouches(a)).slice(0, 10);
  const topAir = weekRows.slice().sort((a, b) => getAirYards(b) - getAirYards(a)).slice(0, 10);
  const topPassing = weekRows.slice().sort((a, b) => getPassYards(b) - getPassYards(a)).slice(0, 10);
  const topRushing = weekRows.slice().sort((a, b) => getRushYards(b) - getRushYards(a)).slice(0, 10);
  const topReceiving = weekRows.slice().sort((a, b) => getRecYards(b) - getRecYards(a)).slice(0, 10);

  const topCatch = weekRows
    .slice()
    .filter((row) => getTargets(row) >= 4)
    .sort((a, b) => (getCatchRate(b) ?? 0) - (getCatchRate(a) ?? 0))
    .slice(0, 10);
  const topYpt = weekRows
    .slice()
    .filter((row) => getTargets(row) >= 4)
    .sort((a, b) => (getYpt(b) ?? -Infinity) - (getYpt(a) ?? -Infinity))
    .slice(0, 10);
  const topYpr = weekRows
    .slice()
    .filter((row) => getReceptions(row) >= 4)
    .sort((a, b) => (getYpr(b) ?? -Infinity) - (getYpr(a) ?? -Infinity))
    .slice(0, 10);
  const topYptTouch = weekRows
    .slice()
    .filter((row) => getTouches(row) >= 6)
    .sort((a, b) => (getYptTouch(b) ?? -Infinity) - (getYptTouch(a) ?? -Infinity))
    .slice(0, 10);

  const topTd = weekRows
    .slice()
    .map((row) => ({ row, total: getTdTotal(row) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
  const topPassTd = weekRows
    .slice()
    .sort((a, b) => toNumber(b.stats?.passing_td) - toNumber(a.stats?.passing_td))
    .slice(0, 10);
  const topRushTd = weekRows
    .slice()
    .sort((a, b) => toNumber(b.stats?.rushing_td) - toNumber(a.stats?.rushing_td))
    .slice(0, 10);
  const topRecTd = weekRows
    .slice()
    .sort((a, b) => toNumber(b.stats?.receiving_td) - toNumber(a.stats?.receiving_td))
    .slice(0, 10);

  const topTargetShare = weekRows
    .slice()
    .sort((a, b) => toNumber(b.usage?.targetShare) - toNumber(a.usage?.targetShare))
    .slice(0, 10);
  const topAirShare = weekRows
    .slice()
    .sort((a, b) => toNumber(b.usage?.airYardsShare) - toNumber(a.usage?.airYardsShare))
    .slice(0, 10);
  const topWopr = weekRows
    .slice()
    .sort((a, b) => toNumber(b.usage?.wopr) - toNumber(a.usage?.wopr))
    .slice(0, 10);
  const topRacr = weekRows
    .slice()
    .filter((row) => getAirYards(row) >= 20)
    .sort((a, b) => toNumber(b.usage?.racr) - toNumber(a.usage?.racr))
    .slice(0, 10);
  const topPacr = weekRows
    .slice()
    .filter((row) => getAirYards(row) >= 20)
    .sort((a, b) => toNumber(b.usage?.pacr) - toNumber(a.usage?.pacr))
    .slice(0, 10);
  const topPassEpa = weekRows
    .slice()
    .sort((a, b) => toNumber(b.usage?.passingEpa) - toNumber(a.usage?.passingEpa))
    .slice(0, 10);
  const topRushEpa = weekRows
    .slice()
    .sort((a, b) => toNumber(b.usage?.rushingEpa) - toNumber(a.usage?.rushingEpa))
    .slice(0, 10);
  const topRecEpa = weekRows
    .slice()
    .sort((a, b) => toNumber(b.usage?.receivingEpa) - toNumber(a.usage?.receivingEpa))
    .slice(0, 10);

  const availableWeeks = weeks.filter((wk) => wk <= week);
  const windowWeeks = availableWeeks.slice(-lookback);
  const windowSet = new Set(windowWeeks);
  const windowRows = seasonRows.filter((row) => row.week && windowSet.has(row.week));
  const playerScores = new Map<
    string,
    { name: string; team?: string; position?: string; scores: number[] }
  >();
  for (const row of windowRows) {
    if (!row.player_id) continue;
    const score = scoreNfl(row.stats ?? {}).totalRounded ?? 0;
    const entry = playerScores.get(row.player_id) ?? {
      name: row.player_display_name,
      team: row.team,
      position: row.position,
      scores: [],
    };
    entry.scores.push(score);
    playerScores.set(row.player_id, entry);
  }

  const minGames = Math.min(3, lookback);
  const tournamentRows = Array.from(playerScores.entries())
    .map(([playerId, entry]) => {
      const scores = entry.scores;
      const avg = average(scores);
      const std = standardDeviation(scores);
      const ceiling = scores.length ? Math.max(...scores) : 0;
      const floor = scores.length ? Math.min(...scores) : 0;
      const boomThreshold = avg + std;
      const boomRate = scores.length ? scores.filter((s) => s >= boomThreshold).length / scores.length : 0;
      return {
        playerId,
        name: entry.name,
        team: entry.team,
        position: entry.position,
        games: scores.length,
        avg,
        std,
        ceiling,
        floor,
        boomRate,
      };
    })
    .filter((row) => row.games >= minGames);

  const topCeiling = tournamentRows.slice().sort((a, b) => b.ceiling - a.ceiling).slice(0, 10);
  const topFloor = tournamentRows.slice().sort((a, b) => b.floor - a.floor).slice(0, 10);
  const topBoom = tournamentRows.slice().sort((a, b) => b.boomRate - a.boomRate).slice(0, 10);
  const bestConsistency = tournamentRows.slice().sort((a, b) => a.std - b.std).slice(0, 10);
  const tabLabel = TAB_OPTIONS.find((opt) => opt.key === tab)?.label ?? "Efficiency";

  return (
    <NflPageShell
      title="NFL advanced stats"
      description={`Weekly leaders with ${tabLabel.toLowerCase()} focus from nflverse player stats.`}
    >
      <section className="mt-6 flex flex-wrap gap-3">
        {SAMPLE_SEASONS.map((year) => (
          <Link
            key={year}
            className={`rounded-full border px-4 py-2 text-sm ${
              year === season
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/advanced-stats${buildQuery({
              season: String(year),
              week: String(week),
              season_type: seasonType,
              tab,
              lookback: String(lookback),
            })}`}
          >
            {year}
          </Link>
        ))}
        {SEASON_TYPES.map((type) => (
          <Link
            key={type}
            className={`rounded-full border px-3 py-2 text-xs ${
              type === seasonType
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/advanced-stats${buildQuery({
              season: String(season),
              week: String(week),
              season_type: type,
              tab,
              lookback: String(lookback),
            })}`}
          >
            {type}
          </Link>
        ))}
      </section>

      <section className="mt-4 flex flex-wrap gap-2">
        {TAB_OPTIONS.map((option) => (
          <Link
            key={option.key}
            className={`rounded-full border px-4 py-2 text-sm ${
              option.key === tab
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/advanced-stats${buildQuery({
              season: String(season),
              week: String(week),
              season_type: seasonType,
              tab: option.key,
              lookback: String(lookback),
            })}`}
          >
            {option.label}
          </Link>
        ))}
      </section>

      {tab === "tournament" && (
        <section className="mt-4 flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <span className="uppercase tracking-wide">Lookback</span>
          {LOOKBACK_OPTIONS.map((option) => (
            <Link
              key={option}
              className={`rounded-full border px-3 py-1 ${
                option === lookback
                  ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                  : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              }`}
              href={`/nfl/advanced-stats${buildQuery({
                season: String(season),
                week: String(week),
                season_type: seasonType,
                tab,
                lookback: String(option),
              })}`}
            >
              {option}w
            </Link>
          ))}
          <span className="rounded-full border border-black/10 px-3 py-1 text-[11px] uppercase tracking-wide dark:border-white/10">
            Min games {minGames}
          </span>
        </section>
      )}

      <section className="mt-4 flex flex-wrap gap-2">
        {weeks.map((wk) => (
          <Link
            key={wk}
            className={`rounded-full border px-3 py-1 text-xs ${
              wk === week
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/advanced-stats${buildQuery({
              season: String(season),
              week: String(wk),
              season_type: seasonType,
              tab,
              lookback: String(lookback),
            })}`}
          >
            Week {wk}
          </Link>
        ))}
      </section>

      {tab === "volume" && (
        <>
          <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
              <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                Target leaders
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                  <tr>
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2">Team</th>
                    <th className="px-3 py-2">Tgt</th>
                    <th className="px-3 py-2">Rec</th>
                  </tr>
                </thead>
                <tbody>
                  {topTargets.map((row) => (
                    <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                      <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{getTargets(row)}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{getReceptions(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
              <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                Touch leaders
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                  <tr>
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2">Team</th>
                    <th className="px-3 py-2">Touches</th>
                    <th className="px-3 py-2">Carries</th>
                  </tr>
                </thead>
                <tbody>
                  {topTouches.map((row) => (
                    <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                      <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{getTouches(row)}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{getCarries(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
              <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                Air yards leaders
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                  <tr>
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2">Team</th>
                    <th className="px-3 py-2">Air Yds</th>
                    <th className="px-3 py-2">Tgt</th>
                  </tr>
                </thead>
                <tbody>
                  {topAir.map((row) => (
                    <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                      <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                        {formatDecimal(getAirYards(row), 0)}
                      </td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{getTargets(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
              <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                Passing yards leaders
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                  <tr>
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2">Team</th>
                    <th className="px-3 py-2">Yards</th>
                    <th className="px-3 py-2">TD</th>
                  </tr>
                </thead>
                <tbody>
                  {topPassing.map((row) => (
                    <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                      <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{getPassYards(row)}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.stats?.passing_td ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
              <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                Rushing yards leaders
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                  <tr>
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2">Team</th>
                    <th className="px-3 py-2">Yards</th>
                    <th className="px-3 py-2">TD</th>
                  </tr>
                </thead>
                <tbody>
                  {topRushing.map((row) => (
                    <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                      <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{getRushYards(row)}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.stats?.rushing_td ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
              <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                Receiving yards leaders
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                  <tr>
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2">Team</th>
                    <th className="px-3 py-2">Yards</th>
                    <th className="px-3 py-2">Rec</th>
                  </tr>
                </thead>
                <tbody>
                  {topReceiving.map((row) => (
                    <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                      <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{getRecYards(row)}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{getReceptions(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {tab === "efficiency" && (
        <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              Catch rate leaders
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Tgt</th>
                  <th className="px-3 py-2">Catch%</th>
                </tr>
              </thead>
              <tbody>
                {topCatch.map((row) => (
                  <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{getTargets(row)}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatPercent(getCatchRate(row))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              Yards per target
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Rec Yds</th>
                  <th className="px-3 py-2">Y/Tgt</th>
                </tr>
              </thead>
              <tbody>
                {topYpt.map((row) => (
                  <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{getRecYards(row)}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatDecimal(getYpt(row))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              Yards per reception
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Rec</th>
                  <th className="px-3 py-2">Y/Rec</th>
                </tr>
              </thead>
              <tbody>
                {topYpr.map((row) => (
                  <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{getReceptions(row)}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatDecimal(getYpr(row))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              Yards per touch
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Touches</th>
                  <th className="px-3 py-2">Y/Tch</th>
                </tr>
              </thead>
              <tbody>
                {topYptTouch.map((row) => (
                  <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{getTouches(row)}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatDecimal(getYptTouch(row))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              RACR leaders
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Air Yds</th>
                  <th className="px-3 py-2">RACR</th>
                </tr>
              </thead>
              <tbody>
                {topRacr.map((row) => (
                  <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatDecimal(getAirYards(row), 0)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatDecimal(row.usage?.racr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              PACR leaders
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Air Yds</th>
                  <th className="px-3 py-2">PACR</th>
                </tr>
              </thead>
              <tbody>
                {topPacr.map((row) => (
                  <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatDecimal(getAirYards(row), 0)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatDecimal(row.usage?.pacr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "redzone" && (
        <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              Total TD leaders
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Total TD</th>
                </tr>
              </thead>
              <tbody>
                {topTd.map((entry) => (
                  <tr key={entry.row.player_id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{entry.row.player_display_name}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{entry.row.team ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{entry.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              Passing TD leaders
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Pass TD</th>
                </tr>
              </thead>
              <tbody>
                {topPassTd.map((row) => (
                  <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.stats?.passing_td ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              Rushing TD leaders
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Rush TD</th>
                </tr>
              </thead>
              <tbody>
                {topRushTd.map((row) => (
                  <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.stats?.rushing_td ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              Receiving TD leaders
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Rec TD</th>
                </tr>
              </thead>
              <tbody>
                {topRecTd.map((row) => (
                  <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.stats?.receiving_td ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "advanced" && (
        <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              Target share leaders
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Tgt%</th>
                  <th className="px-3 py-2">Tgt</th>
                </tr>
              </thead>
              <tbody>
                {topTargetShare.map((row) => (
                  <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatPercent(row.usage?.targetShare)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{getTargets(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              Air share leaders
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Air%</th>
                  <th className="px-3 py-2">Air Yds</th>
                </tr>
              </thead>
              <tbody>
                {topAirShare.map((row) => (
                  <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatPercent(row.usage?.airYardsShare)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatDecimal(getAirYards(row), 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              WOPR leaders
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">WOPR</th>
                  <th className="px-3 py-2">Tgt%</th>
                </tr>
              </thead>
              <tbody>
                {topWopr.map((row) => (
                  <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatDecimal(row.usage?.wopr)}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatPercent(row.usage?.targetShare)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              Passing EPA leaders
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">EPA</th>
                  <th className="px-3 py-2">Yds</th>
                </tr>
              </thead>
              <tbody>
                {topPassEpa.map((row) => (
                  <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatDecimal(row.usage?.passingEpa)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{getPassYards(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              Rushing EPA leaders
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">EPA</th>
                  <th className="px-3 py-2">Yds</th>
                </tr>
              </thead>
              <tbody>
                {topRushEpa.map((row) => (
                  <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatDecimal(row.usage?.rushingEpa)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{getRushYards(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              Receiving EPA leaders
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">EPA</th>
                  <th className="px-3 py-2">Yds</th>
                </tr>
              </thead>
              <tbody>
                {topRecEpa.map((row) => (
                  <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatDecimal(row.usage?.receivingEpa)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{getRecYards(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "tournament" && (
        <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              Ceiling leaders
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Pos</th>
                  <th className="px-3 py-2">Ceil</th>
                  <th className="px-3 py-2">Avg</th>
                </tr>
              </thead>
              <tbody>
                {topCeiling.map((row) => (
                  <tr key={row.playerId} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{row.name}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.position ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatDecimal(row.ceiling, 1)}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatDecimal(row.avg, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              Floor leaders
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Pos</th>
                  <th className="px-3 py-2">Floor</th>
                  <th className="px-3 py-2">Avg</th>
                </tr>
              </thead>
              <tbody>
                {topFloor.map((row) => (
                  <tr key={row.playerId} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{row.name}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.position ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatDecimal(row.floor, 1)}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatDecimal(row.avg, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              Boom rate leaders
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Pos</th>
                  <th className="px-3 py-2">Boom%</th>
                  <th className="px-3 py-2">Std</th>
                </tr>
              </thead>
              <tbody>
                {topBoom.map((row) => (
                  <tr key={row.playerId} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{row.name}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.position ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatPercent(row.boomRate, 0)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatDecimal(row.std, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              Consistency leaders
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Pos</th>
                  <th className="px-3 py-2">Std</th>
                  <th className="px-3 py-2">Avg</th>
                </tr>
              </thead>
              <tbody>
                {bestConsistency.map((row) => (
                  <tr key={row.playerId} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{row.name}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.position ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatDecimal(row.std, 1)}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatDecimal(row.avg, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Stat definitions match nflverse weekly player stats. Tournament metrics use the selected lookback window of
          weeks up to Week {week}.
        </p>
      </section>
    </NflPageShell>
  );
}
