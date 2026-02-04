import Link from "next/link";
import { getBaseUrl } from "@/lib/serverBaseUrl";
import SoccerPageShell from "../_components/SoccerPageShell";
import JobStatusPanel from "../../nfl/_components/JobStatusPanel";
import { SOCCER_COMPETITIONS, getFeaturedSoccerCompetitions } from "@/lib/soccerStats";

type SummaryResponse = {
  status?: string;
  jobId?: string;
  competitionId?: number;
  seasonId?: number;
  top?: number;
  matchesTotal?: number;
  players?: Array<{
    playerId: number;
    playerName: string;
    teamName: string;
    position: string;
    games: number;
    totalPoints: number;
    totalRounded: number;
    average: number;
  }>;
  matchesProcessed?: number;
};

function buildQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export default async function SoccerTournamentSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ competition?: string; season?: string; top?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const competitionId = Number(params.competition ?? SOCCER_COMPETITIONS[0].id);
  const seasonId = Number(params.season ?? SOCCER_COMPETITIONS[0].seasonId);
  const top = Math.min(200, Math.max(10, Number(params.top ?? "50") || 50));

  const baseUrl = await getBaseUrl();
  const query = new URLSearchParams();
  query.set("competition_id", String(competitionId));
  query.set("season_id", String(seasonId));
  query.set("top", String(top));
  if (params.mode) query.set("mode", params.mode);

  const res = await fetch(`${baseUrl}/api/stats/football/tournament-summary?${query.toString()}`, {
    next: { revalidate: 3600 },
  });
  const data = (await res.json()) as SummaryResponse;
  const isJob = Boolean(data.status && !data.players);

  const csvHref = `/api/stats/football/tournament-summary${buildQuery({
    competition_id: String(competitionId),
    season_id: String(seasonId),
    top: String(top),
    format: "csv",
    mode: params.mode,
  })}`;

  const selected = SOCCER_COMPETITIONS.find(
    (comp) => comp.id === competitionId && comp.seasonId === seasonId
  );
  const featuredCompetitions = getFeaturedSoccerCompetitions({ id: competitionId, seasonId });

  return (
    <SoccerPageShell title="Soccer tournament summary" description="Aggregate player scores over a competition season.">
      <section className="mt-6 space-y-3">
        <div className="flex flex-wrap gap-3">
          {featuredCompetitions.map((comp) => (
            <Link
              key={`${comp.id}-${comp.seasonId}`}
              className={`rounded-full border px-4 py-2 text-sm ${
                comp.id === competitionId && comp.seasonId === seasonId
                  ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                  : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              }`}
              href={`/soccer/tournament-summary${buildQuery({
                competition: String(comp.id),
                season: String(comp.seasonId),
                top: String(top),
              })}`}
            >
              {comp.label}
            </Link>
          ))}
        </div>
        <details className="rounded-xl border border-black/10 bg-white p-3 text-sm text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
          <summary className="cursor-pointer text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            All competitions
          </summary>
          <div className="mt-3 flex max-h-64 flex-wrap gap-2 overflow-y-auto">
            {SOCCER_COMPETITIONS.map((comp) => (
              <Link
                key={`all-${comp.id}-${comp.seasonId}`}
                className={`rounded-full border px-3 py-1 text-xs ${
                  comp.id === competitionId && comp.seasonId === seasonId
                    ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                }`}
                href={`/soccer/tournament-summary${buildQuery({
                  competition: String(comp.id),
                  season: String(comp.seasonId),
                  top: String(top),
                })}`}
              >
                {comp.label}
              </Link>
            ))}
          </div>
        </details>
      </section>

      <form className="mt-6 flex flex-wrap items-end gap-3" method="GET">
        <input type="hidden" name="competition" value={String(competitionId)} />
        <input type="hidden" name="season" value={String(seasonId)} />
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Top
          <input
            name="top"
            defaultValue={top}
            className="mt-1 block w-24 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Mode
          <select
            name="mode"
            defaultValue={params.mode ?? "async"}
            className="mt-1 block w-28 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            <option value="async">async</option>
            <option value="sync">sync</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md border border-black/10 bg-black px-4 py-2 text-sm text-white hover:bg-zinc-800 dark:border-white/10 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Load
        </button>
      </form>

      <section className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          {selected?.label ?? "Competition"} · {data.matchesProcessed ?? "?"} matches processed.
          {" "}
          <Link className="text-blue-400 hover:underline" href={csvHref}>
            Download CSV
          </Link>
        </p>
      </section>

      {isJob ? (
        <section className="mt-8 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <JobStatusPanel
            jobId={data.jobId}
            initialStatus={data.status}
            initialProcessed={data.matchesProcessed}
            initialTotal={data.matchesTotal}
          />
        </section>
      ) : null}

      <section className="mt-8">
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
              {(data.players ?? []).map((row) => (
                <tr key={row.playerId} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.playerName}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.teamName}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.position}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.games}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.totalRounded.toFixed(1)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.average.toFixed(1)}</td>
                </tr>
              ))}
              {data.players && data.players.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={6}>
                    No players found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </SoccerPageShell>
  );
}
