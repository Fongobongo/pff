import Link from "next/link";
import { getBaseUrl } from "@/lib/serverBaseUrl";
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
  searchParams: Promise<{ season?: string; week?: string; season_type?: string }>;
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
