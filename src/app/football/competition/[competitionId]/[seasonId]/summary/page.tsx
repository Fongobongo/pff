import Link from "next/link";
import TournamentSummaryClient from "./Client";

export default async function TournamentSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ competitionId: string; seasonId: string }>;
  searchParams: Promise<{ limit?: string; top?: string }>;
}) {
  const { competitionId, seasonId } = await params;
  const { limit, top } = await searchParams;
  const topValue = top ?? "50";

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto max-w-4xl p-6">
        <header className="mt-10">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Tournament summary
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Competition {competitionId}, season {seasonId}
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
            href={`/football/competition/${competitionId}/${seasonId}/summary?top=${topValue}`}
          >
            All matches
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

        <TournamentSummaryClient
          competitionId={competitionId}
          seasonId={seasonId}
          limit={limit}
          top={topValue}
        />
      </main>
    </div>
  );
}
