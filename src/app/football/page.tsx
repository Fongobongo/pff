import Link from "next/link";
import { getBaseUrl } from "@/lib/serverBaseUrl";

const SAMPLE_COMPETITIONS = [
  { id: 2, seasonId: 27, label: "Premier League 2015/2016" },
  { id: 9, seasonId: 281, label: "1. Bundesliga 2023/2024" },
  { id: 11, seasonId: 1, label: "La Liga 2003/2004" },
];

export default async function FootballPage() {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/stats/football/competitions`, {
    next: { revalidate: 3600 },
  });
  const data = await res.json();

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto max-w-4xl p-6">
        <header className="mt-10">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Football stats (StatsBomb Open Data)
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Browse competitions and drill into match-level scoring.
          </p>
        </header>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-black dark:text-white">Quick picks</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SAMPLE_COMPETITIONS.map((item) => (
              <Link
                key={`${item.id}-${item.seasonId}`}
                className="rounded-xl border border-black/10 bg-white p-4 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                href={`/football/competition/${item.id}/${item.seasonId}`}
              >
                <div className="text-sm text-zinc-600 dark:text-zinc-400">Competition</div>
                <div className="mt-1 text-lg font-medium text-black dark:text-white">{item.label}</div>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-black dark:text-white">All competitions</h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Competition</th>
                  <th className="px-3 py-2">Season</th>
                  <th className="px-3 py-2">Country</th>
                </tr>
              </thead>
              <tbody>
                {(data.competitions ?? []).map((comp: any) => (
                  <tr
                    key={`${comp.competition_id}-${comp.season_id}`}
                    className="border-t border-black/10 dark:border-white/10"
                  >
                    <td className="px-3 py-2">
                      <Link
                        className="text-black hover:underline dark:text-white"
                        href={`/football/competition/${comp.competition_id}/${comp.season_id}`}
                      >
                        {comp.competition_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{comp.season_name}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{comp.country_name}</td>
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
