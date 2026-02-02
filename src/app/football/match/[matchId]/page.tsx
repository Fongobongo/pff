import Link from "next/link";
import { getBaseUrl } from "@/lib/serverBaseUrl";

export default async function MatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ competition_id?: string; season_id?: string }>;
}) {
  const { matchId } = await params;
  const { competition_id, season_id } = await searchParams;
  const baseUrl = await getBaseUrl();
  const query = new URLSearchParams();
  query.set("match_id", matchId);
  if (competition_id) query.set("competition_id", competition_id);
  if (season_id) query.set("season_id", season_id);

  const res = await fetch(`${baseUrl}/api/stats/football/score-from-match?${query.toString()}`, {
    next: { revalidate: 3600 },
  });
  const data = await res.json();

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto max-w-5xl p-6">
        <header className="mt-10">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Match {matchId}
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Competition tier: {data.competitionTier ?? "unknown"}
          </p>
        </header>

        <section className="mt-8">
          <div className="flex flex-wrap gap-3">
            <Link
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              href={
                competition_id && season_id
                  ? `/football/competition/${competition_id}/${season_id}`
                  : "/football"
              }
            >
              Back to matches
            </Link>
          </div>
        </section>

        <section className="mt-8">
          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Position</th>
                  <th className="px-3 py-2">Minutes</th>
                  <th className="px-3 py-2">Score</th>
                </tr>
              </thead>
              <tbody>
                {(data.players ?? []).map((player: any) => (
                  <tr key={player.playerId} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{player.playerName}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{player.teamName}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{player.position}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {player.minutesPlayed?.toFixed?.(1) ?? player.minutesPlayed}
                    </td>
                    <td className="px-3 py-2 text-black dark:text-white">
                      {player.score?.totalRounded ?? player.score?.total}
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
