import Link from "next/link";
import { getBaseUrl } from "@/lib/serverBaseUrl";

export default async function StandingsPage({
  searchParams,
}: {
  searchParams: Promise<{ competition?: string; season?: string }>;
}) {
  const params = await searchParams;
  const competition = params.competition ?? "PL";
  const season = params.season;

  const baseUrl = await getBaseUrl();
  const query = new URLSearchParams();
  query.set("competition", competition);
  if (season) query.set("season", season);

  const res = await fetch(`${baseUrl}/api/football-data/standings?${query.toString()}`, {
    next: { revalidate: 300 },
  });
  const data = await res.json();
  const standings = data.standings?.standings ?? [];
  const table = standings.find((item: any) => item.type === "TOTAL") ?? standings[0];
  const rows = table?.table ?? [];

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto max-w-5xl p-6">
        <header className="mt-10">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Standings — {competition}
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            football-data.org competition table
          </p>
        </header>

        <section className="mt-6 flex flex-wrap gap-3">
          <Link
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            href="/football"
          >
            Back to stats
          </Link>
          <Link
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            href={`/football/fixtures?competition=${competition}`}
          >
            Fixtures
          </Link>
        </section>

        <section className="mt-8">
          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">P</th>
                  <th className="px-3 py-2">W</th>
                  <th className="px-3 py-2">D</th>
                  <th className="px-3 py-2">L</th>
                  <th className="px-3 py-2">GD</th>
                  <th className="px-3 py-2">Pts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: any) => (
                  <tr key={row.team?.id ?? row.position} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.position}</td>
                    <td className="px-3 py-2 text-black dark:text-white">{row.team?.name}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.playedGames}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.won}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.draw}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.lost}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.goalDifference}</td>
                    <td className="px-3 py-2 text-black dark:text-white">{row.points}</td>
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
