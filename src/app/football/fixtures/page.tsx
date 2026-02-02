import Link from "next/link";
import { getBaseUrl } from "@/lib/serverBaseUrl";

export default async function FixturesPage({
  searchParams,
}: {
  searchParams: Promise<{ competition?: string; matchday?: string; season?: string; page?: string; page_size?: string }>;
}) {
  const params = await searchParams;
  const competition = params.competition ?? "PL";
  const matchday = params.matchday;
  const season = params.season;
  const page = Number(params.page ?? "1");
  const pageSize = Number(params.page_size ?? "20");

  const baseUrl = await getBaseUrl();
  const query = new URLSearchParams();
  query.set("competition", competition);
  if (matchday) query.set("matchday", matchday);
  if (season) query.set("season", season);
  if (Number.isFinite(page)) query.set("page", String(page));
  if (Number.isFinite(pageSize)) query.set("page_size", String(pageSize));

  const res = await fetch(`${baseUrl}/api/football-data/matches?${query.toString()}`, {
    next: { revalidate: 300 },
  });
  const data = await res.json();
  const matches = data.pageMatches ?? data.matches?.matches ?? [];
  const totalMatches = data.totalMatches ?? matches.length;
  const totalPages = pageSize > 0 ? Math.ceil(totalMatches / pageSize) : 1;
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto max-w-5xl p-6">
        <header className="mt-10">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Fixtures — {competition}
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            football-data.org competition matches (tier {data.competitionTier ?? "?"})
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
            href={`/football/fixtures/score-from-fixtures?competition=${competition}`}
          >
            Score bridge
          </Link>
          <Link
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            href={`/football/standings?competition=${competition}`}
          >
            Standings
          </Link>
          {hasPrev ? (
            <Link
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              href={`/football/fixtures?competition=${competition}${season ? `&season=${season}` : ""}${
                matchday ? `&matchday=${matchday}` : ""
              }&page=${page - 1}&page_size=${pageSize}`}
            >
              Prev
            </Link>
          ) : null}
          {hasNext ? (
            <Link
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              href={`/football/fixtures?competition=${competition}${season ? `&season=${season}` : ""}${
                matchday ? `&matchday=${matchday}` : ""
              }&page=${page + 1}&page_size=${pageSize}`}
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
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Match</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match: any) => (
                  <tr key={match.id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {match.utcDate?.slice?.(0, 10) ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-black dark:text-white">
                      {match.homeTeam?.name ?? "Home"} vs {match.awayTeam?.name ?? "Away"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {match.score?.fullTime?.home ?? "-"}:{match.score?.fullTime?.away ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{match.status}</td>
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
