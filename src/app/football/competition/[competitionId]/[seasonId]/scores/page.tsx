import Link from "next/link";
import { getBaseUrl } from "@/lib/serverBaseUrl";

export default async function CompetitionScoresPage({
  params,
}: {
  params: Promise<{ competitionId: string; seasonId: string }>;
}) {
  const { competitionId, seasonId } = await params;
  const baseUrl = await getBaseUrl();
  const res = await fetch(
    `${baseUrl}/api/stats/football/score-competition?competition_id=${competitionId}&season_id=${seasonId}&limit=5&include_players=false`,
    { next: { revalidate: 3600 } }
  );
  const data = await res.json();

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto max-w-4xl p-6">
        <header className="mt-10">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Competition scores preview
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Showing first {data.matchCount} matches. Use the API for full scoring exports.
          </p>
        </header>

        <section className="mt-8">
          <div className="flex flex-wrap gap-3">
            <Link
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              href={`/football/competition/${competitionId}/${seasonId}`}
            >
              Back to matches
            </Link>
            <Link
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              href="/football"
            >
              All competitions
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
                  <tr key={match.matchId} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {match.homeTeam ?? "Home"} vs {match.awayTeam ?? "Away"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {match.homeScore ?? "-"}:{match.awayScore ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{match.matchDate}</td>
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
