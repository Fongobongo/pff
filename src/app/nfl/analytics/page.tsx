import Link from "next/link";
import { getBaseUrl } from "@/lib/serverBaseUrl";
import { fetchNflWeeklyStats } from "@/lib/stats/nflverse";
import { scoreNfl } from "@/lib/stats/nfl";
import NflPageShell from "../_components/NflPageShell";

const SAMPLE_SEASONS = [2021, 2022, 2023];
const SEASON_TYPES = ["REG", "POST", "PRE"] as const;

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

function scoreValue(row: ScoreWeekRow): number {
  const val = row.score?.totalRounded ?? row.score?.total ?? 0;
  return Number(val) || 0;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((acc, val) => acc + val, 0) / values.length;
}

function percentile(sorted: number[], pct: number): number {
  if (!sorted.length) return 0;
  const rank = (pct / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function formatNumber(value?: number, digits = 2): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
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

export default async function NflAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; week?: string; season_type?: string; player_a?: string; player_b?: string }>;
}) {
  const params = await searchParams;
  const rawSeason = Number(params.season ?? "2023");
  const season = Number.isFinite(rawSeason) ? rawSeason : 2023;
  const seasonType = (params.season_type ?? "REG").toUpperCase();
  const rawWeek = params.week ? Number(params.week) : undefined;
  const requestedWeek = rawWeek !== undefined && Number.isFinite(rawWeek) ? rawWeek : undefined;

  const baseUrl = await getBaseUrl();
  const scheduleRes = await fetch(
    `${baseUrl}/api/stats/nfl/schedule?season=${season}&game_type=${seasonType}`,
    { next: { revalidate: 3600 } }
  );
  const schedule = (await scheduleRes.json()) as ScheduleResponse;
  const weeks = schedule.weeks.length ? schedule.weeks : [1];
  const resolvedWeek = requestedWeek && weeks.includes(requestedWeek) ? requestedWeek : weeks[weeks.length - 1];

  const weeklyData = await fetchNflWeeklyStats({ season, seasonType });

  const query = new URLSearchParams();
  query.set("season", String(season));
  query.set("week", String(resolvedWeek));
  if (seasonType) query.set("season_type", seasonType);

  const res = await fetch(`${baseUrl}/api/stats/nfl/score-week?${query.toString()}`, {
    next: { revalidate: 3600 },
  });
  const data = (await res.json()) as ScoreWeekResponse;

  const scores = data.rows.map(scoreValue).sort((a, b) => a - b);
  const totalPlayers = scores.length;
  const sum = scores.reduce((acc, val) => acc + val, 0);
  const average = totalPlayers ? sum / totalPlayers : 0;
  const median =
    totalPlayers === 0
      ? 0
      : totalPlayers % 2 === 1
        ? scores[Math.floor(totalPlayers / 2)]
        : (scores[totalPlayers / 2 - 1] + scores[totalPlayers / 2]) / 2;

  const percentileRows = [50, 75, 90, 95, 99].map((pct) => ({
    pct,
    value: percentile(scores, pct),
  }));

  const topScorers = data.rows
    .slice()
    .sort((a, b) => scoreValue(b) - scoreValue(a))
    .slice(0, 10);

  const playerMap = new Map<
    string,
    {
      playerId: string;
      name: string;
      team?: string;
      position?: string;
      weeks: Array<{
        week: number;
        score: number;
        targets: number;
        touches: number;
        air: number;
        fpts: number;
      }>;
    }
  >();

  for (const row of weeklyData.rows) {
    if (!row.player_id || !row.week) continue;
    if (row.week > resolvedWeek) continue;
    const score = scoreNfl(row.stats).totalRounded ?? 0;
    const targets = row.usage?.targets ?? 0;
    const touches = (row.usage?.carries ?? 0) + (row.usage?.receptions ?? 0);
    const air = row.usage?.airYards ?? 0;
    const fpts = row.usage?.fantasyPoints ?? score;

    const entry = playerMap.get(row.player_id) ?? {
      playerId: row.player_id,
      name: row.player_display_name,
      team: row.team,
      position: row.position,
      weeks: [],
    };
    entry.weeks.push({ week: row.week, score, targets, touches, air, fpts });
    playerMap.set(row.player_id, entry);
  }

  const playerStats = new Map<
    string,
    {
      playerId: string;
      name: string;
      team?: string;
      position?: string;
      games: number;
      seasonAvg: number;
      l3Avg: number;
      l3Targets: number;
      l3Touches: number;
      l3Air: number;
      l3Fpts: number;
      usageTrend: number;
      bestWeek?: number;
      bestScore?: number;
    }
  >();

  for (const entry of playerMap.values()) {
    const ordered = entry.weeks.sort((a, b) => a.week - b.week);
    const last3 = ordered.slice(-3);
    const prev3 = ordered.slice(-6, -3);
    const seasonAvg = average(ordered.map((w) => w.score));
    const l3Avg = average(last3.map((w) => w.score));
    const l3Targets = average(last3.map((w) => w.targets));
    const l3Touches = average(last3.map((w) => w.touches));
    const l3Air = average(last3.map((w) => w.air));
    const l3Fpts = average(last3.map((w) => w.fpts));
    const prevTargets = average(prev3.map((w) => w.targets));
    const prevTouches = average(prev3.map((w) => w.touches));
    const prevAir = average(prev3.map((w) => w.air));
    const usageTrend = (l3Targets - prevTargets + l3Touches - prevTouches + (l3Air - prevAir) / 20) / 3;
    const best = ordered.reduce(
      (acc, w) => (w.score > acc.score ? { week: w.week, score: w.score } : acc),
      { week: ordered[0]?.week ?? 0, score: ordered[0]?.score ?? 0 }
    );

    playerStats.set(entry.playerId, {
      playerId: entry.playerId,
      name: entry.name,
      team: entry.team,
      position: entry.position,
      games: ordered.length,
      seasonAvg,
      l3Avg,
      l3Targets,
      l3Touches,
      l3Air,
      l3Fpts,
      usageTrend,
      bestWeek: best.week || undefined,
      bestScore: best.score || undefined,
    });
  }

  const optionPlayers = data.rows
    .slice()
    .sort((a, b) => scoreValue(b) - scoreValue(a))
    .map((row) => ({
      id: row.player_id,
      name: row.player_display_name,
      team: row.team,
    }));

  const topIds = optionPlayers.map((row) => row.id).filter(Boolean);
  const defaultA = params.player_a ?? topIds[0] ?? "";
  const defaultB = params.player_b ?? topIds.find((id) => id !== defaultA) ?? "";
  const playerA = defaultA ? playerStats.get(defaultA) : undefined;
  const playerB = defaultB ? playerStats.get(defaultB) : undefined;

  const positionMap = new Map<string, { position: string; count: number; total: number; max: number }>();
  const teamMap = new Map<string, { team: string; count: number; total: number; max: number }>();

  for (const row of data.rows) {
    const score = scoreValue(row);
    const position = row.position ?? "UNK";
    const team = row.team ?? "UNK";

    const posEntry = positionMap.get(position) ?? { position, count: 0, total: 0, max: 0 };
    posEntry.count += 1;
    posEntry.total += score;
    posEntry.max = Math.max(posEntry.max, score);
    positionMap.set(position, posEntry);

    const teamEntry = teamMap.get(team) ?? { team, count: 0, total: 0, max: 0 };
    teamEntry.count += 1;
    teamEntry.total += score;
    teamEntry.max = Math.max(teamEntry.max, score);
    teamMap.set(team, teamEntry);
  }

  const positions = Array.from(positionMap.values()).map((entry) => ({
    ...entry,
    avg: entry.count ? entry.total / entry.count : 0,
  }));
  positions.sort((a, b) => b.avg - a.avg);

  const teams = Array.from(teamMap.values()).map((entry) => ({
    ...entry,
    avg: entry.count ? entry.total / entry.count : 0,
  }));
  teams.sort((a, b) => b.avg - a.avg);

  return (
    <NflPageShell title="NFL analytics" description="Week-level scoring summaries from nflverse.">
      <section className="mt-6 flex flex-wrap gap-3">
        {SAMPLE_SEASONS.map((year) => (
          <Link
            key={year}
            className={`rounded-full border px-4 py-2 text-sm ${
              year === season
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/analytics${buildQuery({ season: String(year), week: params.week, season_type: seasonType })}`}
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
            href={`/nfl/analytics${buildQuery({ season: String(season), week: params.week, season_type: type })}`}
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
              wk === resolvedWeek
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/analytics${buildQuery({ season: String(season), week: String(wk), season_type: seasonType })}`}
          >
            Week {wk}
          </Link>
        ))}
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Players</div>
          <div className="mt-2 text-2xl font-semibold text-black dark:text-white">{totalPlayers}</div>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Average score</div>
          <div className="mt-2 text-2xl font-semibold text-black dark:text-white">{average.toFixed(2)}</div>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Median score</div>
          <div className="mt-2 text-2xl font-semibold text-black dark:text-white">{median.toFixed(2)}</div>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Contest percentiles
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Pct</th>
                <th className="px-3 py-2">Score</th>
              </tr>
            </thead>
            <tbody>
              {percentileRows.map((row) => (
                <tr key={row.pct} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.pct}%</td>
                  <td className="px-3 py-2 text-black dark:text-white">{formatNumber(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5 lg:col-span-2">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Top weekly scores
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2">Score</th>
              </tr>
            </thead>
            <tbody>
              {topScorers.map((row) => (
                <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.position ?? "—"}</td>
                  <td className="px-3 py-2 text-black dark:text-white">{formatNumber(scoreValue(row))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Player compare</div>
          <form className="mt-4 flex flex-wrap items-end gap-3" method="GET">
            <input type="hidden" name="season" value={season} />
            <input type="hidden" name="season_type" value={seasonType} />
            <input type="hidden" name="week" value={resolvedWeek} />
            <label className="text-xs text-zinc-600 dark:text-zinc-400">
              Player A
              <select
                name="player_a"
                defaultValue={defaultA}
                className="mt-1 block w-56 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
              >
                {optionPlayers.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} {row.team ? `(${row.team})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-600 dark:text-zinc-400">
              Player B
              <select
                name="player_b"
                defaultValue={defaultB}
                className="mt-1 block w-56 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
              >
                {optionPlayers.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} {row.team ? `(${row.team})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md border border-black/10 bg-black px-4 py-2 text-sm text-white hover:bg-zinc-800 dark:border-white/10 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Compare
            </button>
          </form>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Metric</th>
                  <th className="px-3 py-2">{playerA?.name ?? "Player A"}</th>
                  <th className="px-3 py-2">{playerB?.name ?? "Player B"}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Team", a: playerA?.team ?? "—", b: playerB?.team ?? "—" },
                  { label: "Position", a: playerA?.position ?? "—", b: playerB?.position ?? "—" },
                  { label: "Games", a: playerA?.games ?? "—", b: playerB?.games ?? "—" },
                  { label: "Season FPPG", a: formatNumber(playerA?.seasonAvg), b: formatNumber(playerB?.seasonAvg) },
                  { label: "L3 FPPG", a: formatNumber(playerA?.l3Avg), b: formatNumber(playerB?.l3Avg) },
                  { label: "L3 Targets", a: formatNumber(playerA?.l3Targets), b: formatNumber(playerB?.l3Targets) },
                  { label: "L3 Touches", a: formatNumber(playerA?.l3Touches), b: formatNumber(playerB?.l3Touches) },
                  { label: "L3 Air", a: formatNumber(playerA?.l3Air, 1), b: formatNumber(playerB?.l3Air, 1) },
                  { label: "L3 FPts", a: formatNumber(playerA?.l3Fpts, 1), b: formatNumber(playerB?.l3Fpts, 1) },
                  { label: "Usage Trend", a: formatNumber(playerA?.usageTrend), b: formatNumber(playerB?.usageTrend) },
                  {
                    label: "Best week",
                    a: playerA?.bestWeek ? `W${playerA.bestWeek} (${formatNumber(playerA.bestScore)})` : "—",
                    b: playerB?.bestWeek ? `W${playerB.bestWeek} (${formatNumber(playerB.bestScore)})` : "—",
                  },
                ].map((row) => (
                  <tr key={row.label} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.label}</td>
                    <td className="px-3 py-2 text-black dark:text-white">{row.a}</td>
                    <td className="px-3 py-2 text-black dark:text-white">{row.b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            By position
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Position</th>
                <th className="px-3 py-2">Players</th>
                <th className="px-3 py-2">Avg</th>
                <th className="px-3 py-2">Max</th>
                <th className="px-3 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((row) => (
                <tr key={row.position} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.position}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.count}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.avg.toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.max.toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            By team (top 16 avg)
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Players</th>
                <th className="px-3 py-2">Avg</th>
                <th className="px-3 py-2">Max</th>
                <th className="px-3 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {teams.slice(0, 16).map((row) => (
                <tr key={row.team} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.team}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.count}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.avg.toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.max.toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </NflPageShell>
  );
}
