import Link from "next/link";
import { getBaseUrl } from "@/lib/serverBaseUrl";

export default async function TournamentSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ competitionId: string; seasonId: string }>;
  searchParams: Promise<{ limit?: string; top?: string }>;
}) {
  const { competitionId, seasonId } = await params;
  const { limit, top } = await searchParams;
  const limitValue = limit ?? "5";
  const topValue = top ?? "50";
  const baseUrl = await getBaseUrl();

  const query = new URLSearchParams();
  query.set("competition_id", competitionId);
  query.set("season_id", seasonId);
  query.set("limit", limitValue);
  query.set("top", topValue);

  const res = await fetch(`${baseUrl}/api/stats/football/tournament-summary?${query.toString()}`, {
    next: { revalidate: 3600 },
  });
  const data = await res.json();

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto max-w-4xl p-6">
        <header className="mt-10">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Tournament summary
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Competition {competitionId}, season {seasonId} — tier {data.competitionTier ?? "?"}
          </p>
        </header>

        <section className="mt-6 flex flex-wrap gap-3">
          <Link
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            href={`/football/competition/${competitionId}/${seasonId}`}
          >
            Back to matches
          </Link>
          <Link
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            href={`/football/competition/${competitionId}/${seasonId}/summary?limit=5&top=50`}
          >
            Sample 5 matches
          </Link>
          <Link
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            href={`/football/competition/${competitionId}/${seasonId}/summary?limit=20&top=50`}
          >
            Sample 20 matches
          </Link>
        </section>

        <section className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Matches processed: {data.matchesProcessed ?? 0} · Top: {topValue}
        </section>

        <section className="mt-6">
          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Pos</th>
                  <th className="px-3 py-2">Games</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Avg</th>
                </tr>
              </thead>
              <tbody>
                {(data.players ?? []).map((player: any) => (
                  <tr key={player.playerId} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{player.playerName}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{player.teamName}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{player.position}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{player.games}</td>
                    <td className="px-3 py-2 text-black dark:text-white">
                      {Number(player.totalRounded ?? player.totalPoints).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {Number(player.average ?? 0).toFixed(2)}
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
