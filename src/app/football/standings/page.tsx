import Link from "next/link";
import { getBaseUrl } from "@/lib/serverBaseUrl";

type FootballDataStandingsRow = {
  position?: number;
  team?: { id?: number; name?: string };
  playedGames?: number;
  won?: number;
  draw?: number;
  lost?: number;
  goalDifference?: number;
  points?: number;
};

type FootballDataStandingsEntry = {
  type?: string;
  table?: FootballDataStandingsRow[];
};

type StandingsResponse = {
  competitionTier?: string;
  totalTeams?: number;
  standings?: { standings?: FootballDataStandingsEntry[] };
  table?: FootballDataStandingsRow[];
};

export default async function StandingsPage({
  searchParams,
}: {
  searchParams: Promise<{ competition?: string; season?: string; page?: string; page_size?: string }>;
}) {
  const params = await searchParams;
  const competition = params.competition ?? "PL";
  const season = params.season;
  const page = Number(params.page ?? "1");
  const pageSize = Number(params.page_size ?? "20");

  const baseUrl = await getBaseUrl();
  const query = new URLSearchParams();
  query.set("competition", competition);
  if (season) query.set("season", season);
  if (Number.isFinite(page)) query.set("page", String(page));
  if (Number.isFinite(pageSize)) query.set("page_size", String(pageSize));

  const res = await fetch(`${baseUrl}/api/football-data/standings?${query.toString()}`, {
    next: { revalidate: 300 },
  });
  const data = (await res.json()) as StandingsResponse;
  const standings = data.standings?.standings ?? [];
  const table = standings.find((item) => item.type === "TOTAL") ?? standings[0];
  const rows = data.table ?? table?.table ?? [];
  const totalTeams = data.totalTeams ?? rows.length;
  const totalPages = pageSize > 0 ? Math.ceil(totalTeams / pageSize) : 1;
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto max-w-5xl p-6">
        <header className="mt-10">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Standings — {competition}
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            football-data.org competition table (tier {data.competitionTier ?? "?"})
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
          {hasPrev ? (
            <Link
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              href={`/football/standings?competition=${competition}${season ? `&season=${season}` : ""}&page=${
                page - 1
              }&page_size=${pageSize}`}
            >
              Prev
            </Link>
          ) : null}
          {hasNext ? (
            <Link
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              href={`/football/standings?competition=${competition}${season ? `&season=${season}` : ""}&page=${
                page + 1
              }&page_size=${pageSize}`}
            >
              Next
            </Link>
          ) : null}
        </section>

        <section className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          Page {page} of {totalPages}
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
                {rows.map((row) => (
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
