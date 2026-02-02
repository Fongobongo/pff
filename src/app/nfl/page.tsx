import Link from "next/link";
import { getBaseUrl } from "@/lib/serverBaseUrl";

const SAMPLE_WEEKS = [1, 2, 3, 4, 5];
const SAMPLE_SEASONS = [2021, 2022, 2023];

export default async function NflPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; week?: string }>;
}) {
  const params = await searchParams;
  const rawSeason = Number(params.season ?? 2021);
  const season = Number.isFinite(rawSeason) ? rawSeason : 2021;
  const rawWeek = params.week ? Number(params.week) : 1;
  const week = Number.isFinite(rawWeek) ? rawWeek : 1;
  const baseUrl = await getBaseUrl();

  const query = new URLSearchParams();
  query.set("season", String(season));
  if (Number.isFinite(week)) query.set("week", String(week));

  const res = await fetch(`${baseUrl}/api/stats/nfl/score-week?${query.toString()}`, {
    next: { revalidate: 3600 },
  });
  const data = await res.json();
  const rows = (data.rows ?? []).slice().sort((a: any, b: any) => {
    const aScore = a.score?.totalRounded ?? a.score?.total ?? 0;
    const bScore = b.score?.totalRounded ?? b.score?.total ?? 0;
    return bScore - aScore;
  });

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto max-w-5xl p-6">
        <header className="mt-10">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            NFL weekly scores (nflverse)
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Season {season}, week {week} — sorted by points.
          </p>
        </header>

        <section className="mt-8">
          <div className="flex flex-wrap gap-3">
            {SAMPLE_SEASONS.map((year) => (
              <Link
                key={year}
                className={`rounded-full border px-4 py-2 text-sm ${
                  year === season
                    ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                }`}
                href={`/nfl?season=${year}&week=${week}`}
              >
                {year}
              </Link>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {SAMPLE_WEEKS.map((wk) => (
              <Link
                key={wk}
                className={`rounded-full border px-3 py-1 text-xs ${
                  wk === week
                    ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                }`}
                href={`/nfl?season=${season}&week=${wk}`}
              >
                Week {wk}
              </Link>
            ))}
          </div>
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
                  <th className="px-3 py-2">Pass</th>
                  <th className="px-3 py-2">Rush</th>
                  <th className="px-3 py-2">Rec</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((row: any) => (
                  <tr key={`${row.player_id}-${row.team}`} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2">
                      <Link
                        className="text-black hover:underline dark:text-white"
                        href={`/nfl/player/${row.player_id}?season=${season}`}
                      >
                        {row.player_display_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.position}</td>
                    <td className="px-3 py-2 text-black dark:text-white">
                      {row.score?.totalRounded ?? row.score?.total}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.stats?.passing_yards ?? 0}y / {row.stats?.passing_td ?? 0} TD
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.stats?.rushing_yards ?? 0}y / {row.stats?.rushing_td ?? 0} TD
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.stats?.receiving_yards ?? 0}y / {row.stats?.receiving_td ?? 0} TD
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
