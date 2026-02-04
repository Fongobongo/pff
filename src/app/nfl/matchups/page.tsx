import Link from "next/link";
import { getBaseUrl } from "@/lib/serverBaseUrl";
import NflPageShell from "../_components/NflPageShell";

const SAMPLE_SEASONS = [2021, 2022, 2023];
const GAME_TYPES = ["REG", "POST", "PRE"] as const;

type ScheduleResponse = {
  season: number;
  week: number | null;
  gameType: string | null;
  weeks: number[];
  rows: Array<{
    gameId: string;
    week?: number;
    gameday?: string;
    weekday?: string;
    gametime?: string;
    awayTeam?: string;
    awayScore?: number;
    homeTeam?: string;
    homeScore?: number;
    stadium?: string;
  }>;
};

type TeamStats = {
  games: number;
  pointsFor: number;
  pointsAgainst: number;
};

type TeamMetrics = {
  games: number;
  pointsForAvg: number;
  pointsAgainstAvg: number;
  defenseRank?: number;
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

function formatNumber(value?: number, digits = 1): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

export default async function NflMatchupsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; week?: string; game_type?: string }>;
}) {
  const params = await searchParams;
  const rawSeason = Number(params.season ?? "2023");
  const season = Number.isFinite(rawSeason) ? rawSeason : 2023;
  const gameType = (params.game_type ?? "REG").toUpperCase();
  const rawWeek = params.week ? Number(params.week) : undefined;
  const weekParam = rawWeek !== undefined && Number.isFinite(rawWeek) ? rawWeek : undefined;

  const baseUrl = await getBaseUrl();
  const query = new URLSearchParams();
  query.set("season", String(season));
  query.set("game_type", gameType);
  if (Number.isFinite(weekParam)) query.set("week", String(weekParam));

  const res = await fetch(`${baseUrl}/api/stats/nfl/schedule?${query.toString()}`, {
    next: { revalidate: 3600 },
  });
  const data = (await res.json()) as ScheduleResponse;

  const resolvedWeek = Number.isFinite(weekParam)
    ? weekParam
    : data.weeks.length > 0
      ? data.weeks[0]
      : undefined;

  const rows = Number.isFinite(weekParam)
    ? data.rows
    : resolvedWeek !== undefined
      ? data.rows.filter((row) => row.week === resolvedWeek)
      : data.rows;

  const scoringRows = data.rows.filter((row) => {
    if (row.awayScore === undefined || row.homeScore === undefined) return false;
    if (!row.week) return false;
    if (resolvedWeek !== undefined && row.week > resolvedWeek) return false;
    return true;
  });

  const teamStats = new Map<string, TeamStats>();
  for (const game of scoringRows) {
    if (!game.awayTeam || !game.homeTeam) continue;
    const away = game.awayTeam.toUpperCase();
    const home = game.homeTeam.toUpperCase();
    const awayScore = game.awayScore ?? 0;
    const homeScore = game.homeScore ?? 0;

    const awayEntry = teamStats.get(away) ?? { games: 0, pointsFor: 0, pointsAgainst: 0 };
    awayEntry.games += 1;
    awayEntry.pointsFor += awayScore;
    awayEntry.pointsAgainst += homeScore;
    teamStats.set(away, awayEntry);

    const homeEntry = teamStats.get(home) ?? { games: 0, pointsFor: 0, pointsAgainst: 0 };
    homeEntry.games += 1;
    homeEntry.pointsFor += homeScore;
    homeEntry.pointsAgainst += awayScore;
    teamStats.set(home, homeEntry);
  }

  const metrics = new Map<string, TeamMetrics>();
  for (const [team, stats] of teamStats.entries()) {
    metrics.set(team, {
      games: stats.games,
      pointsForAvg: stats.games ? stats.pointsFor / stats.games : 0,
      pointsAgainstAvg: stats.games ? stats.pointsAgainst / stats.games : 0,
      defenseRank: undefined,
    });
  }

  const defenseRanks = Array.from(metrics.entries())
    .sort((a, b) => a[1].pointsAgainstAvg - b[1].pointsAgainstAvg)
    .map(([team]) => team);

  defenseRanks.forEach((team, idx) => {
    const entry = metrics.get(team);
    if (entry) entry.defenseRank = idx + 1;
  });

  return (
    <NflPageShell title="NFL matchups" description="Schedule, results, and implied points from nflverse history.">
      <section className="mt-6 flex flex-wrap gap-3">
        {SAMPLE_SEASONS.map((year) => (
          <Link
            key={year}
            className={`rounded-full border px-4 py-2 text-sm ${
              year === season
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/matchups${buildQuery({ season: String(year), game_type: gameType, week: params.week })}`}
          >
            {year}
          </Link>
        ))}
        {GAME_TYPES.map((type) => (
          <Link
            key={type}
            className={`rounded-full border px-3 py-2 text-xs ${
              type === gameType
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/matchups${buildQuery({ season: String(season), game_type: type, week: params.week })}`}
          >
            {type}
          </Link>
        ))}
      </section>

      <section className="mt-4 flex flex-wrap gap-2">
        {data.weeks.map((wk) => (
          <Link
            key={wk}
            className={`rounded-full border px-3 py-1 text-xs ${
              wk === resolvedWeek
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/matchups${buildQuery({ season: String(season), game_type: gameType, week: String(wk) })}`}
          >
            Week {wk}
          </Link>
        ))}
      </section>

      <section className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Off/Def averages use completed games through week {resolvedWeek ?? "—"}. Implied points are modeled from a
          team’s scoring average plus opponent points allowed.
        </p>
      </section>

      <section className="mt-8">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Week</th>
                <th className="px-3 py-2">Away</th>
                <th className="px-3 py-2">Home</th>
                <th className="px-3 py-2">Away Off Avg</th>
                <th className="px-3 py-2">Away Def Avg</th>
                <th className="px-3 py-2">Away Def Rank</th>
                <th className="px-3 py-2">Away Implied</th>
                <th className="px-3 py-2">Home Off Avg</th>
                <th className="px-3 py-2">Home Def Avg</th>
                <th className="px-3 py-2">Home Def Rank</th>
                <th className="px-3 py-2">Home Implied</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Stadium</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((game) => {
                const awayMetrics = game.awayTeam ? metrics.get(game.awayTeam.toUpperCase()) : undefined;
                const homeMetrics = game.homeTeam ? metrics.get(game.homeTeam.toUpperCase()) : undefined;
                const awayImplied =
                  awayMetrics && homeMetrics
                    ? (awayMetrics.pointsForAvg + homeMetrics.pointsAgainstAvg) / 2
                    : undefined;
                const homeImplied =
                  homeMetrics && awayMetrics
                    ? (homeMetrics.pointsForAvg + awayMetrics.pointsAgainstAvg) / 2
                    : undefined;

                return (
                  <tr key={game.gameId} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{game.week ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{game.awayTeam ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{game.homeTeam ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatNumber(awayMetrics?.pointsForAvg)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatNumber(awayMetrics?.pointsAgainstAvg)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {awayMetrics?.defenseRank ? `#${awayMetrics.defenseRank}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-black dark:text-white">{formatNumber(awayImplied)}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatNumber(homeMetrics?.pointsForAvg)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatNumber(homeMetrics?.pointsAgainstAvg)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {homeMetrics?.defenseRank ? `#${homeMetrics.defenseRank}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-black dark:text-white">{formatNumber(homeImplied)}</td>
                    <td className="px-3 py-2 text-black dark:text-white">
                      {game.awayScore !== undefined && game.homeScore !== undefined
                        ? `${game.awayScore} - ${game.homeScore}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {game.gameday ?? "—"} {game.weekday ? `(${game.weekday})` : ""} {game.gametime ?? ""}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{game.stadium ?? "—"}</td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={14}>
                    No games for this selection.
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
