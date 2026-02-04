import Link from "next/link";
import SoccerPageShell from "../_components/SoccerPageShell";
import { SOCCER_COMPETITIONS, fetchSoccerCompetitionScores } from "@/lib/soccerStats";

function buildQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

type OpportunityRow = {
  playerId: number;
  playerName: string;
  teamName?: string;
  position?: string;
  lastScore: number;
  avgPrevious: number;
  delta: number;
};

export default async function SoccerOpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ competition?: string; season?: string; limit?: string }>;
}) {
  const params = await searchParams;
  const competitionId = Number(params.competition ?? SOCCER_COMPETITIONS[0].id);
  const seasonId = Number(params.season ?? SOCCER_COMPETITIONS[0].seasonId);
  const limit = Number(params.limit ?? "20");
  const safeLimit = Number.isFinite(limit) ? Math.max(4, Math.min(60, limit)) : 20;

  const data = await fetchSoccerCompetitionScores({
    competitionId,
    seasonId,
    limit: safeLimit,
  });

  const history = new Map<number, { playerName: string; teamName?: string; position?: string; scores: number[] }>();

  for (const match of data.matches ?? []) {
    for (const player of match.players ?? []) {
      const score = player.score?.total ?? 0;
      const entry = history.get(player.playerId) ?? {
        playerName: player.playerName,
        teamName: player.teamName,
        position: player.position,
        scores: [],
      };
      entry.scores.push(score);
      history.set(player.playerId, entry);
    }
  }

  const breakout: OpportunityRow[] = [];

  for (const [playerId, entry] of history.entries()) {
    if (entry.scores.length < 2) continue;
    const lastScore = entry.scores[entry.scores.length - 1];
    const previous = entry.scores.slice(0, -1);
    const avgPrevious = previous.reduce((acc, val) => acc + val, 0) / previous.length;
    const delta = lastScore - avgPrevious;
    breakout.push({
      playerId,
      playerName: entry.playerName,
      teamName: entry.teamName,
      position: entry.position,
      lastScore,
      avgPrevious,
      delta,
    });
  }

  breakout.sort((a, b) => b.delta - a.delta);

  const currentCompetition = SOCCER_COMPETITIONS.find(
    (item) => item.id === competitionId && item.seasonId === seasonId
  );

  return (
    <SoccerPageShell title="Soccer opportunities" description="Breakout watch based on recent fantasy scoring.">
      <section className="mt-6 flex flex-wrap gap-3">
        {SOCCER_COMPETITIONS.map((comp) => (
          <Link
            key={`${comp.id}-${comp.seasonId}`}
            className={`rounded-full border px-4 py-2 text-sm ${
              comp.id === competitionId && comp.seasonId === seasonId
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/soccer/opportunities${buildQuery({
              competition: String(comp.id),
              season: String(comp.seasonId),
              limit: String(safeLimit),
            })}`}
          >
            {comp.label}
          </Link>
        ))}
      </section>

      <section className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Showing {safeLimit} matches · {currentCompetition?.label ?? "Competition"}. Breakout = last-match score vs previous average.
        </p>
      </section>

      <section className="mt-8">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2">Last</th>
                <th className="px-3 py-2">Prev avg</th>
                <th className="px-3 py-2">Δ</th>
              </tr>
            </thead>
            <tbody>
              {breakout.slice(0, 25).map((row) => (
                <tr key={row.playerId} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.playerName}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.teamName ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.position ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.lastScore.toFixed(1)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.avgPrevious.toFixed(1)}</td>
                  <td className={`px-3 py-2 ${row.delta >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                    {row.delta.toFixed(1)}
                  </td>
                </tr>
              ))}
              {breakout.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={6}>
                    Not enough match data to compute opportunities.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          How to use: players with big positive deltas may be trending up in form and usage based on recent match events.
        </p>
      </section>
    </SoccerPageShell>
  );
}
