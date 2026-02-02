import Link from "next/link";
import { getBaseUrl } from "@/lib/serverBaseUrl";

const SEASONS = [2019, 2020, 2021, 2022, 2023];
const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);
const SEASON_TYPES = ["REG", "POST"] as const;

export default async function NflPlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ season?: string; season_type?: string; week?: string }>;
}) {
  const { playerId } = await params;
  const { season, season_type, week } = await searchParams;
  const seasonValue = season ?? "2021";
  const baseUrl = await getBaseUrl();
  const query = new URLSearchParams();
  query.set("player_id", playerId);
  query.set("season", seasonValue);
  if (season_type) query.set("season_type", season_type);
  if (week) query.set("week", week);

  const res = await fetch(`${baseUrl}/api/stats/nfl/player?${query.toString()}`, {
    next: { revalidate: 3600 },
  });
  const data = await res.json();

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto max-w-4xl p-6">
        <header className="mt-10">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            {data.player?.displayName ?? data.player?.playerName ?? playerId}
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            {data.player?.team ?? ""} {data.player?.position ?? ""} — Season {data.season}
            {data.seasonType ? ` (${data.seasonType})` : ""}
            {data.week ? ` · Week ${data.week}` : ""}
          </p>
        </header>

        <section className="mt-6 flex flex-wrap gap-3">
          <Link
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            href={`/nfl?season=${seasonValue}`}
          >
            Back to weekly scores
          </Link>
        </section>

        <section className="mt-6 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Season</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {SEASONS.map((year) => (
                <Link
                  key={year}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    String(year) === seasonValue
                      ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                      : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                  }`}
                  href={`/nfl/player/${playerId}?season=${year}${season_type ? `&season_type=${season_type}` : ""}${week ? `&week=${week}` : ""}`}
                >
                  {year}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Season type</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                className={`rounded-full border px-3 py-1 text-xs ${
                  !season_type
                    ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                }`}
                href={`/nfl/player/${playerId}?season=${seasonValue}${week ? `&week=${week}` : ""}`}
              >
                All
              </Link>
              {SEASON_TYPES.map((type) => (
                <Link
                  key={type}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    season_type === type
                      ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                      : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                  }`}
                  href={`/nfl/player/${playerId}?season=${seasonValue}&season_type=${type}${week ? `&week=${week}` : ""}`}
                >
                  {type}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Week</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                className={`rounded-full border px-3 py-1 text-xs ${
                  !week
                    ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                }`}
                href={`/nfl/player/${playerId}?season=${seasonValue}${season_type ? `&season_type=${season_type}` : ""}`}
              >
                All
              </Link>
              {WEEKS.map((wk) => (
                <Link
                  key={wk}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    String(wk) === week
                      ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                      : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                  }`}
                  href={`/nfl/player/${playerId}?season=${seasonValue}${season_type ? `&season_type=${season_type}` : ""}&week=${wk}`}
                >
                  {wk}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Games</div>
            <div className="mt-2 text-2xl font-semibold text-black dark:text-white">
              {data.summary?.games ?? 0}
            </div>
          </div>
          <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total</div>
            <div className="mt-2 text-2xl font-semibold text-black dark:text-white">
              {data.summary?.totalRounded ?? data.summary?.totalPoints ?? 0}
            </div>
          </div>
          <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Avg</div>
            <div className="mt-2 text-2xl font-semibold text-black dark:text-white">
              {Number(data.summary?.average ?? 0).toFixed(2)}
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Week</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Pass</th>
                  <th className="px-3 py-2">Rush</th>
                  <th className="px-3 py-2">Rec</th>
                </tr>
              </thead>
              <tbody>
                {(data.rows ?? []).map((row: any) => (
                  <tr key={row.week} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.week}</td>
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
