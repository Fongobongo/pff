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

type TrendRow = {
  playerId: string;
  name: string;
  team?: string;
  position?: string;
  currentScore: number;
  previousScore: number;
  delta: number;
};

function buildQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

function scoreValue(row: ScoreWeekRow): number {
  const val = row.score?.totalRounded ?? row.score?.total ?? 0;
  return Number(val) || 0;
}

export default async function NflTrendingPage({
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
  const prevWeekCandidates = weeks.filter((wk) => wk < resolvedWeek);
  const prevWeek = prevWeekCandidates.length ? prevWeekCandidates[prevWeekCandidates.length - 1] : undefined;

  const currentQuery = new URLSearchParams();
  currentQuery.set("season", String(season));
  currentQuery.set("week", String(resolvedWeek));
  if (seasonType) currentQuery.set("season_type", seasonType);

  const prevQuery = new URLSearchParams();
  prevQuery.set("season", String(season));
  if (prevWeek !== undefined) prevQuery.set("week", String(prevWeek));
  if (seasonType) prevQuery.set("season_type", seasonType);

  const [currentRes, prevRes] = await Promise.all([
    fetch(`${baseUrl}/api/stats/nfl/score-week?${currentQuery.toString()}`, { next: { revalidate: 3600 } }),
    prevWeek !== undefined
      ? fetch(`${baseUrl}/api/stats/nfl/score-week?${prevQuery.toString()}`, { next: { revalidate: 3600 } })
      : Promise.resolve(null),
  ]);

  const current = (await currentRes.json()) as ScoreWeekResponse;
  const prev = prevRes ? ((await prevRes.json()) as ScoreWeekResponse) : { rows: [] };

  const prevScores = new Map<string, number>();
  for (const row of prev.rows) {
    prevScores.set(row.player_id, scoreValue(row));
  }

  const trends: TrendRow[] = current.rows.map((row) => {
    const currentScore = scoreValue(row);
    const previousScore = prevScores.get(row.player_id) ?? 0;
    return {
      playerId: row.player_id,
      name: row.player_display_name,
      team: row.team,
      position: row.position,
      currentScore,
      previousScore,
      delta: currentScore - previousScore,
    };
  });

  const risers = trends
    .filter((row) => row.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 50);

  const fallers = trends
    .filter((row) => row.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 50);

  return (
    <NflPageShell title="NFL trending" description="Week-over-week scoring deltas from nflverse.">
      <section className="mt-6 flex flex-wrap gap-3">
        {SAMPLE_SEASONS.map((year) => (
          <Link
            key={year}
            className={`rounded-full border px-4 py-2 text-sm ${
              year === season
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/trending${buildQuery({ season: String(year), week: params.week, season_type: seasonType })}`}
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
            href={`/nfl/trending${buildQuery({ season: String(season), week: params.week, season_type: type })}`}
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
            href={`/nfl/trending${buildQuery({ season: String(season), week: String(wk), season_type: seasonType })}`}
          >
            Week {wk}
          </Link>
        ))}
      </section>

      <section className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Comparing week {resolvedWeek} vs {prevWeek ?? "—"}.
        </p>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Biggest risers
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2">Δ</th>
                <th className="px-3 py-2">Now</th>
                <th className="px-3 py-2">Prev</th>
              </tr>
            </thead>
            <tbody>
              {risers.map((row) => (
                <tr key={row.playerId} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">
                    <Link className="hover:underline" href={`/nfl/player/${row.playerId}?season=${season}&season_type=${seasonType}`}>
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.position ?? "—"}</td>
                  <td className="px-3 py-2 text-green-600 dark:text-green-400">
                    +{row.delta.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-black dark:text-white">{row.currentScore.toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.previousScore.toFixed(2)}</td>
                </tr>
              ))}
              {risers.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={6}>
                    No risers found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Biggest fallers
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2">Δ</th>
                <th className="px-3 py-2">Now</th>
                <th className="px-3 py-2">Prev</th>
              </tr>
            </thead>
            <tbody>
              {fallers.map((row) => (
                <tr key={row.playerId} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">
                    <Link className="hover:underline" href={`/nfl/player/${row.playerId}?season=${season}&season_type=${seasonType}`}>
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.position ?? "—"}</td>
                  <td className="px-3 py-2 text-red-600 dark:text-red-400">{row.delta.toFixed(2)}</td>
                  <td className="px-3 py-2 text-black dark:text-white">{row.currentScore.toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.previousScore.toFixed(2)}</td>
                </tr>
              ))}
              {fallers.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={6}>
                    No fallers found.
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
