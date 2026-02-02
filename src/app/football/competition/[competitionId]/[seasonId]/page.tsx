import Link from "next/link";
import { getBaseUrl } from "@/lib/serverBaseUrl";

export default async function CompetitionPage({
  params,
}: {
  params: Promise<{ competitionId: string; seasonId: string }>;
}) {
  const { competitionId, seasonId } = await params;
  const baseUrl = await getBaseUrl();
  const res = await fetch(
    `${baseUrl}/api/stats/football/matches?competition_id=${competitionId}&season_id=${seasonId}`,
    { next: { revalidate: 3600 } }
  );
  const data = await res.json();

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto max-w-4xl p-6">
        <header className="mt-10">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Competition {competitionId} — season {seasonId}
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Pick a match to compute player scores.
          </p>
        </header>

        <section className="mt-8">
          <div className="flex flex-wrap gap-3">
            <Link
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              href={`/football/competition/${competitionId}/${seasonId}/scores`}
            >
              Compute scores for all matches
            </Link>
            <Link
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              href={`/football/competition/${competitionId}/${seasonId}/summary`}
            >
              Tournament summary
            </Link>
            <Link
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              href="/football"
            >
              Back to competitions
            </Link>
          </div>
        </section>

        <section className="mt-8">
          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Match</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {(data.matches ?? []).map((match: any) => (
                  <tr key={match.match_id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2">
                      <Link
                        className="text-black hover:underline dark:text-white"
                        href={`/football/match/${match.match_id}?competition_id=${competitionId}&season_id=${seasonId}`}
                      >
                        {match.home_team?.home_team_name ?? "Home"} vs {match.away_team?.away_team_name ?? "Away"}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {match.home_score ?? "-"}:{match.away_score ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{match.match_date}</td>
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
