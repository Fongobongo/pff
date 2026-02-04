import Link from "next/link";
import { getBaseUrl } from "@/lib/serverBaseUrl";

type ScoreFromFixture = {
  fixtureId: number;
  fixtureDate?: string;
  status?: string;
  homeTeam?: string;
  awayTeam?: string;
  statsbombMatchId?: number | null;
  matchSwapped?: boolean;
  matchScore?: number | null;
  matchConfidence?: string | null;
  matchReason?: string | null;
  scoreFromMatchUrl?: string | null;
};

type ScoreFromFixturesResponse = {
  totalFixtures?: number;
  returnedFixtures?: number;
  matchedFixtures?: number;
  unmatchedFixtures?: number;
  competitionTier?: string;
  fixtures?: ScoreFromFixture[];
};

export default async function ScoreFromFixturesPage({
  searchParams,
}: {
  searchParams: Promise<{
    competition?: string;
    season?: string;
    status?: string;
    statsbomb_competition_id?: string;
    statsbomb_season_id?: string;
    limit?: string;
    include_scores?: string;
  }>;
}) {
  const params = await searchParams;
  const competition = params.competition ?? "PL";
  const season = params.season ?? "";
  const status = params.status ?? "";
  const statsbombCompetitionId = params.statsbomb_competition_id ?? "2";
  const statsbombSeasonId = params.statsbomb_season_id ?? "27";
  const limit = params.limit ?? "50";
  const includeScores = params.include_scores === "true";

  const baseUrl = await getBaseUrl();
  const query = new URLSearchParams();
  query.set("competition", competition);
  if (season) query.set("season", season);
  if (status) query.set("status", status);
  query.set("statsbomb_competition_id", statsbombCompetitionId);
  query.set("statsbomb_season_id", statsbombSeasonId);
  if (limit) query.set("limit", limit);
  if (includeScores) query.set("include_scores", "true");

  const res = await fetch(`${baseUrl}/api/football-data/score-from-fixtures?${query.toString()}`, {
    next: { revalidate: 300 },
  });
  const data = (await res.json()) as ScoreFromFixturesResponse;
  const fixtures = data.fixtures ?? [];
  const unmatched = fixtures.filter((item) => !item.statsbombMatchId);

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto max-w-6xl p-6">
        <header className="mt-10">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Fixtures → score-from-match bridge
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Map football-data.org fixtures to StatsBomb matches and score them.
          </p>
        </header>

        <section className="mt-6 flex flex-wrap gap-3">
          <Link
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            href={`/football/fixtures?competition=${competition}`}
          >
            Back to fixtures
          </Link>
          <Link
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            href="/football"
          >
            Back to football stats
          </Link>
        </section>

        <section className="mt-6 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-3" method="get">
            <label className="text-sm text-zinc-600 dark:text-zinc-400">
              Competition code
              <input
                name="competition"
                defaultValue={competition}
                className="mt-2 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
            </label>
            <label className="text-sm text-zinc-600 dark:text-zinc-400">
              Season (year)
              <input
                name="season"
                defaultValue={season}
                className="mt-2 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
                placeholder="2023"
              />
            </label>
            <label className="text-sm text-zinc-600 dark:text-zinc-400">
              Status
              <input
                name="status"
                defaultValue={status}
                className="mt-2 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
                placeholder="FINISHED"
              />
            </label>
            <label className="text-sm text-zinc-600 dark:text-zinc-400">
              StatsBomb competition ID
              <input
                name="statsbomb_competition_id"
                defaultValue={statsbombCompetitionId}
                className="mt-2 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
            </label>
            <label className="text-sm text-zinc-600 dark:text-zinc-400">
              StatsBomb season ID
              <input
                name="statsbomb_season_id"
                defaultValue={statsbombSeasonId}
                className="mt-2 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
            </label>
            <label className="text-sm text-zinc-600 dark:text-zinc-400">
              Limit
              <input
                name="limit"
                defaultValue={limit}
                className="mt-2 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                name="include_scores"
                defaultChecked={includeScores}
                value="true"
              />
              Include player scores (slow)
            </label>
            <div className="flex items-end">
              <button
                className="rounded-md border border-black/10 bg-black px-4 py-2 text-sm text-white hover:bg-black/80 dark:border-white/10 dark:bg-white dark:text-black dark:hover:bg-white/80"
                type="submit"
              >
                Run mapping
              </button>
            </div>
          </form>
        </section>

        <section className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Total fixtures: {data.totalFixtures ?? 0} · Returned: {data.returnedFixtures ?? 0} · Matched:{" "}
          {data.matchedFixtures ?? 0} · Unmatched: {data.unmatchedFixtures ?? 0} · Tier:{" "}
          {data.competitionTier ?? "?"}
        </section>

        {unmatched.length > 0 ? (
          <section className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-500/10 dark:text-red-200">
            Unmatched fixtures: {unmatched.length}. Scroll for details below.
          </section>
        ) : null}

        <section className="mt-6">
          <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Fixture</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">StatsBomb</th>
                  <th className="px-3 py-2">Confidence</th>
                  <th className="px-3 py-2">Match score</th>
                  <th className="px-3 py-2">Score link</th>
                </tr>
              </thead>
              <tbody>
                {fixtures.map((item) => (
                  <tr
                    key={item.fixtureId}
                    className={`border-t border-black/10 dark:border-white/10 ${
                      item.statsbombMatchId
                        ? item.matchConfidence === "fallback"
                          ? "bg-amber-50/60 dark:bg-amber-500/10"
                          : ""
                        : "bg-red-50/70 dark:bg-red-500/10"
                    }`}
                  >
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {item.fixtureDate ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-black dark:text-white">
                      {item.homeTeam ?? "Home"} vs {item.awayTeam ?? "Away"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{item.status ?? "-"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {item.statsbombMatchId ? `#${item.statsbombMatchId}` : "—"}
                      {item.matchSwapped ? " (swapped)" : ""}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {item.matchConfidence ?? (item.statsbombMatchId ? "strong" : "—")}
                      {item.matchReason ? ` (${item.matchReason})` : ""}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {item.matchScore ? Number(item.matchScore).toFixed(2) : "0.00"}
                    </td>
                    <td className="px-3 py-2">
                      {item.scoreFromMatchUrl ? (
                        <Link className="text-black hover:underline dark:text-white" href={item.scoreFromMatchUrl}>
                          Score match
                        </Link>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
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
