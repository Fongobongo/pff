import Link from "next/link";
import { getBaseUrl } from "@/lib/serverBaseUrl";
import NflPageShell from "../_components/NflPageShell";

const SAMPLE_SEASONS = [2021, 2022, 2023];
const SEASON_TYPES = ["REG", "POST", "PRE"] as const;
const TOP_LIMIT = 50;
const PREV_RANK_THRESHOLD = 150;
const TREND_WEEKS = 3;
const DEFAULT_LOOKBACK_WEEKS = 8;

const SORT_OPTIONS = [
  { key: "usage_trend", label: "Usage Trend" },
  { key: "targets_delta", label: "Targets Δ" },
  { key: "touches_delta", label: "Touches Δ" },
  { key: "air_delta", label: "Air Δ" },
  { key: "l3_targets", label: "L3 Targets" },
  { key: "l3_touches", label: "L3 Touches" },
  { key: "l3_air", label: "L3 Air" },
  { key: "l3_yards", label: "L3 Yards" },
  { key: "l3_fpts", label: "L3 FPts" },
  { key: "games", label: "Games" },
] as const;

type ScheduleResponse = {
  weeks: number[];
};

type ScoreWeekRow = {
  player_id: string;
  player_display_name: string;
  team?: string;
  position?: string;
  score?: {
    total?: number;
    totalRounded?: number;
  };
};

type ScoreWeekResponse = {
  rows: ScoreWeekRow[];
};

type WeeklyRow = {
  player_id: string;
  player_display_name: string;
  team?: string;
  position?: string;
  week?: number;
  usage?: {
    carries?: number;
    targets?: number;
    receptions?: number;
    rushingYards?: number;
    receivingYards?: number;
    airYards?: number;
    fantasyPoints?: number;
  };
};

type WeeklyResponse = {
  rows?: WeeklyRow[];
};

type OpportunityRow = {
  playerId: string;
  name: string;
  team?: string;
  position?: string;
  currentScore: number;
  previousScore: number;
  delta: number;
  previousRank?: number;
};

type UsageRow = {
  playerId: string;
  name: string;
  team?: string;
  position?: string;
  games: number;
  l3Targets?: number;
  l3Touches?: number;
  l3Air?: number;
  l3Yards?: number;
  l3Fpts?: number;
  targetsDelta?: number;
  touchesDelta?: number;
  airDelta?: number;
  usageTrend?: number;
};

function scoreValue(row: ScoreWeekRow): number {
  const val = row.score?.totalRounded ?? row.score?.total ?? 0;
  return Number(val) || 0;
}

function parseNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function average(values: number[]): number | undefined {
  if (!values.length) return undefined;
  return values.reduce((acc, val) => acc + val, 0) / values.length;
}

function formatNumber(value?: number, digits = 2): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

function formatDelta(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
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

export default async function NflOpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{
    season?: string;
    week?: string;
    season_type?: string;
    position?: string;
    team?: string;
    lookback?: string;
    min_targets?: string;
    min_touches?: string;
    min_air?: string;
    sort?: string;
    q?: string;
  }>;
}) {
  const params = await searchParams;
  const rawSeason = Number(params.season ?? "2023");
  const season = Number.isFinite(rawSeason) ? rawSeason : 2023;
  const seasonType = (params.season_type ?? "REG").toUpperCase();
  const rawWeek = params.week ? Number(params.week) : undefined;
  const requestedWeek = rawWeek !== undefined && Number.isFinite(rawWeek) ? rawWeek : undefined;
  const positionFilter = params.position?.toUpperCase();
  const teamFilter = params.team?.toUpperCase();
  const lookback = parseNumber(params.lookback, DEFAULT_LOOKBACK_WEEKS, 1, 18);
  const minTargets = parseNumber(params.min_targets, 0, 0, 50);
  const minTouches = parseNumber(params.min_touches, 0, 0, 60);
  const minAir = parseNumber(params.min_air, 0, 0, 300);
  const sort = SORT_OPTIONS.find((opt) => opt.key === params.sort)?.key ?? "usage_trend";
  const q = params.q?.trim().toLowerCase() ?? "";

  const baseUrl = await getBaseUrl();
  const scheduleRes = await fetch(
    `${baseUrl}/api/stats/nfl/schedule?season=${season}&game_type=${seasonType}`,
    { next: { revalidate: 3600 } }
  );
  const schedule = (await scheduleRes.json()) as ScheduleResponse;
  const sanitizedWeeks = schedule.weeks.filter((wk) => wk >= 1);
  const weeks = sanitizedWeeks.length ? sanitizedWeeks : [1];
  const resolvedWeek = requestedWeek && weeks.includes(requestedWeek) ? requestedWeek : weeks[weeks.length - 1];
  const safeResolvedWeek = resolvedWeek >= 1 ? resolvedWeek : 1;
  const prevWeekCandidates = weeks.filter((wk) => wk >= 1 && wk < safeResolvedWeek);
  const prevWeek = prevWeekCandidates.length ? prevWeekCandidates[prevWeekCandidates.length - 1] : undefined;
  const availableWeeks = weeks.filter((wk) => wk <= safeResolvedWeek);
  const windowWeeks = availableWeeks.slice(-lookback);
  const windowWeekSet = new Set(windowWeeks);

  const currentQuery = new URLSearchParams();
  currentQuery.set("season", String(season));
  currentQuery.set("week", String(safeResolvedWeek));
  if (seasonType) currentQuery.set("season_type", seasonType);

  const prevQuery = new URLSearchParams();
  prevQuery.set("season", String(season));
  if (prevWeek !== undefined) prevQuery.set("week", String(prevWeek));
  if (seasonType) prevQuery.set("season_type", seasonType);

  const [currentRes, prevRes, weeklyRes] = await Promise.all([
    fetch(`${baseUrl}/api/stats/nfl/score-week?${currentQuery.toString()}`, { next: { revalidate: 3600 } }),
    prevWeek !== undefined
      ? fetch(`${baseUrl}/api/stats/nfl/score-week?${prevQuery.toString()}`, { next: { revalidate: 3600 } })
      : Promise.resolve(null),
    fetch(`${baseUrl}/api/stats/nfl/weekly?season=${season}&season_type=${seasonType}`, {
      // Payload can exceed Next.js 2MB data-cache limit; skip cache to avoid runtime cache errors.
      cache: "no-store",
    }),
  ]);

  const current = (await currentRes.json()) as ScoreWeekResponse;
  const prev = prevRes ? ((await prevRes.json()) as ScoreWeekResponse) : { rows: [] };
  const weekly = (await weeklyRes.json()) as WeeklyResponse;

  const prevSorted = prev.rows
    .map((row) => ({ id: row.player_id, score: scoreValue(row) }))
    .sort((a, b) => b.score - a.score);

  const prevRankById = new Map<string, number>();
  for (let i = 0; i < prevSorted.length; i += 1) {
    prevRankById.set(prevSorted[i].id, i + 1);
  }

  const prevScoreById = new Map<string, number>();
  for (const row of prev.rows) {
    prevScoreById.set(row.player_id, scoreValue(row));
  }

  const currentSorted = current.rows
    .map((row) => ({
      row,
      score: scoreValue(row),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_LIMIT);

  const breakouts: OpportunityRow[] = currentSorted
    .map(({ row, score }) => {
      const previousScore = prevScoreById.get(row.player_id) ?? 0;
      const previousRank = prevRankById.get(row.player_id);
      return {
        playerId: row.player_id,
        name: row.player_display_name,
        team: row.team,
        position: row.position,
        currentScore: score,
        previousScore,
        delta: score - previousScore,
        previousRank,
      };
    })
    .filter((row) => row.previousRank === undefined || row.previousRank > PREV_RANK_THRESHOLD)
    .sort((a, b) => b.currentScore - a.currentScore);

  type WeekUsage = {
    week: number;
    targets: number;
    touches: number;
    air: number;
    yards: number;
    fpts: number;
  };

  const usageMap = new Map<
    string,
    { playerId: string; name: string; team?: string; position?: string; weeks: WeekUsage[] }
  >();

  for (const row of weekly.rows ?? []) {
    if (!row.player_id || !row.week || !windowWeekSet.has(row.week)) continue;
    const targets = row.usage?.targets ?? 0;
    const carries = row.usage?.carries ?? 0;
    const receptions = row.usage?.receptions ?? 0;
    const air = row.usage?.airYards ?? 0;
    const yards = (row.usage?.rushingYards ?? 0) + (row.usage?.receivingYards ?? 0);
    const fpts = row.usage?.fantasyPoints ?? 0;

    const entry = usageMap.get(row.player_id) ?? {
      playerId: row.player_id,
      name: row.player_display_name,
      team: row.team,
      position: row.position,
      weeks: [],
    };
    entry.weeks.push({
      week: row.week,
      targets,
      touches: carries + receptions,
      air,
      yards,
      fpts,
    });
    usageMap.set(row.player_id, entry);
  }

  const usageRows: UsageRow[] = Array.from(usageMap.values()).map((entry) => {
    const ordered = entry.weeks.sort((a, b) => a.week - b.week);
    const last3 = ordered.slice(-TREND_WEEKS);
    const prev3 = ordered.slice(-TREND_WEEKS * 2, -TREND_WEEKS);

    const l3Targets = average(last3.map((w) => w.targets)) ?? 0;
    const l3Touches = average(last3.map((w) => w.touches)) ?? 0;
    const l3Air = average(last3.map((w) => w.air)) ?? 0;
    const l3Yards = average(last3.map((w) => w.yards)) ?? 0;
    const l3Fpts = average(last3.map((w) => w.fpts)) ?? 0;

    const prevTargets = average(prev3.map((w) => w.targets)) ?? 0;
    const prevTouches = average(prev3.map((w) => w.touches)) ?? 0;
    const prevAir = average(prev3.map((w) => w.air)) ?? 0;

    const targetsDelta = l3Targets - prevTargets;
    const touchesDelta = l3Touches - prevTouches;
    const airDelta = l3Air - prevAir;
    const usageTrend = (targetsDelta + touchesDelta + airDelta / 20) / 3;

    return {
      playerId: entry.playerId,
      name: entry.name,
      team: entry.team,
      position: entry.position,
      games: ordered.length,
      l3Targets,
      l3Touches,
      l3Air,
      l3Yards,
      l3Fpts,
      targetsDelta,
      touchesDelta,
      airDelta,
      usageTrend,
    };
  });

  const teams = Array.from(
    new Set(usageRows.map((row) => row.team).filter((value): value is string => Boolean(value)))
  ).sort();
  const positions = Array.from(
    new Set(usageRows.map((row) => row.position).filter((value): value is string => Boolean(value)))
  ).sort();

  let filteredUsage = usageRows;

  if (positionFilter) {
    filteredUsage = filteredUsage.filter((row) => (row.position ?? "").toUpperCase() === positionFilter);
  }

  if (teamFilter) {
    filteredUsage = filteredUsage.filter((row) => (row.team ?? "").toUpperCase() === teamFilter);
  }

  if (q) {
    filteredUsage = filteredUsage.filter((row) => row.name.toLowerCase().includes(q));
  }

  if (minTargets > 0) {
    filteredUsage = filteredUsage.filter((row) => (row.l3Targets ?? 0) >= minTargets);
  }

  if (minTouches > 0) {
    filteredUsage = filteredUsage.filter((row) => (row.l3Touches ?? 0) >= minTouches);
  }

  if (minAir > 0) {
    filteredUsage = filteredUsage.filter((row) => (row.l3Air ?? 0) >= minAir);
  }

  const usageSorted = filteredUsage.slice().sort((a, b) => {
    switch (sort) {
      case "targets_delta":
        return (b.targetsDelta ?? -Infinity) - (a.targetsDelta ?? -Infinity);
      case "touches_delta":
        return (b.touchesDelta ?? -Infinity) - (a.touchesDelta ?? -Infinity);
      case "air_delta":
        return (b.airDelta ?? -Infinity) - (a.airDelta ?? -Infinity);
      case "l3_targets":
        return (b.l3Targets ?? 0) - (a.l3Targets ?? 0);
      case "l3_touches":
        return (b.l3Touches ?? 0) - (a.l3Touches ?? 0);
      case "l3_air":
        return (b.l3Air ?? 0) - (a.l3Air ?? 0);
      case "l3_yards":
        return (b.l3Yards ?? 0) - (a.l3Yards ?? 0);
      case "l3_fpts":
        return (b.l3Fpts ?? 0) - (a.l3Fpts ?? 0);
      case "games":
        return b.games - a.games;
      case "usage_trend":
      default:
        return (b.usageTrend ?? -Infinity) - (a.usageTrend ?? -Infinity);
    }
  });

  const filterParams = {
    position: params.position,
    team: params.team,
    lookback: params.lookback,
    min_targets: params.min_targets,
    min_touches: params.min_touches,
    min_air: params.min_air,
    sort: params.sort,
    q: params.q,
  };

  return (
    <NflPageShell title="NFL opportunities" description="Usage trends and breakout candidates vs prior-week ranking.">
      <section className="mt-6 flex flex-wrap gap-3">
        {SAMPLE_SEASONS.map((year) => (
          <Link
            key={year}
            className={`rounded-full border px-4 py-2 text-sm ${
              year === season
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/opportunities${buildQuery({
              season: String(year),
              week: params.week,
              season_type: seasonType,
              ...filterParams,
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
            href={`/nfl/opportunities${buildQuery({
              season: String(season),
              week: params.week,
              season_type: type,
              ...filterParams,
            })}`}
          >
            {type}
          </Link>
        ))}
      </section>

      <section className="mt-4 flex flex-wrap gap-2">
        {weeks.map((wk) => (
          <Link
            key={wk}
            className={`rounded-full border px-3 py-1 text-xs ${
              wk === safeResolvedWeek
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/opportunities${buildQuery({
              season: String(season),
              week: String(wk),
              season_type: seasonType,
              ...filterParams,
            })}`}
          >
            Week {wk}
          </Link>
        ))}
      </section>

      <form className="mt-6 flex flex-wrap items-end gap-3" method="GET">
        <input type="hidden" name="season" value={season} />
        <input type="hidden" name="season_type" value={seasonType} />
        <input type="hidden" name="week" value={safeResolvedWeek} />
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Search
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Player name"
            className="mt-1 block w-44 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
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
          Team
          <select
            name="team"
            defaultValue={teamFilter ?? ""}
            className="mt-1 block w-24 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            <option value="">All</option>
            {teams.map((team) => (
              <option key={team} value={team}>
                {team}
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

      <section className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Usage trends track the last {TREND_WEEKS} games inside a {lookback}-week window through week {safeResolvedWeek}.
          Usage Trend blends target, touch, and air-yard deltas.
        </p>
      </section>

      <section className="mt-6">
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <table className="w-full min-w-[1500px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2">Games</th>
                <th className="px-3 py-2">L3 Targets</th>
                <th className="px-3 py-2">L3 Touches</th>
                <th className="px-3 py-2">L3 Air</th>
                <th className="px-3 py-2">L3 Yards</th>
                <th className="px-3 py-2">L3 FPts</th>
                <th className="px-3 py-2">Targets Δ</th>
                <th className="px-3 py-2">Touches Δ</th>
                <th className="px-3 py-2">Air Δ</th>
                <th className="px-3 py-2">Usage Trend</th>
              </tr>
            </thead>
            <tbody>
              {usageSorted.slice(0, 75).map((row) => (
                <tr key={row.playerId} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">
                    <Link className="hover:underline" href={`/nfl/player/${row.playerId}?season=${season}&season_type=${seasonType}`}>
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.position ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.games}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatNumber(row.l3Targets)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatNumber(row.l3Touches)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatNumber(row.l3Air, 1)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatNumber(row.l3Yards, 1)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatNumber(row.l3Fpts, 1)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatDelta(row.targetsDelta)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatDelta(row.touchesDelta)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatDelta(row.airDelta)}</td>
                  <td
                    className={`px-3 py-2 ${(row.usageTrend ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"}`}
                  >
                    {formatDelta(row.usageTrend)}
                  </td>
                </tr>
              ))}
              {usageSorted.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={13}>
                    No usage trends found for this selection.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Showing players in the top {TOP_LIMIT} of week {safeResolvedWeek} who were outside top{" "}
          {PREV_RANK_THRESHOLD} the week before.
        </p>
      </section>

      <section className="mt-8">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Prev score</th>
                <th className="px-3 py-2">Prev rank</th>
                <th className="px-3 py-2">Δ</th>
              </tr>
            </thead>
            <tbody>
              {breakouts.map((row) => (
                <tr key={row.playerId} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">
                    <Link className="hover:underline" href={`/nfl/player/${row.playerId}?season=${season}&season_type=${seasonType}`}>
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.position ?? "—"}</td>
                  <td className="px-3 py-2 text-black dark:text-white">{row.currentScore.toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.previousScore.toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.previousRank ?? "NR"}</td>
                  <td className="px-3 py-2 text-green-600 dark:text-green-400">+{row.delta.toFixed(2)}</td>
                </tr>
              ))}
              {breakouts.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={7}>
                    No breakout candidates found.
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
