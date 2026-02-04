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

function buildQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
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

  return (
    <NflPageShell title="NFL matchups" description="Schedule and results from nflverse.">
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

      <section className="mt-8">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Week</th>
                <th className="px-3 py-2">Away</th>
                <th className="px-3 py-2">Home</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Stadium</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((game) => (
                <tr key={game.gameId} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{game.week ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{game.awayTeam ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{game.homeTeam ?? "—"}</td>
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
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={6}>
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
