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

function toNumber(value: number | undefined): number {
  return Number(value ?? 0) || 0;
}

type PlayerAgg = {
  playerId: number;
  playerName: string;
  teamName?: string;
  position?: string;
  games: number;
  totalPoints: number;
  totalRounded: number;
  goals: number;
  assists: number;
};

export default async function SoccerAdvancedStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ competition?: string; season?: string; limit?: string }>;
}) {
  const params = await searchParams;
  const competitionId = Number(params.competition ?? SOCCER_COMPETITIONS[0].id);
  const seasonId = Number(params.season ?? SOCCER_COMPETITIONS[0].seasonId);
  const limit = Number(params.limit ?? "12");
  const safeLimit = Number.isFinite(limit) ? Math.max(4, Math.min(30, limit)) : 12;

  const data = await fetchSoccerCompetitionScores({
    competitionId,
    seasonId,
    limit: safeLimit,
  });

  const totals = new Map<number, PlayerAgg>();

  for (const match of data.matches ?? []) {
    for (const player of match.players ?? []) {
      const score = player.score?.total ?? 0;
      const totalRounded = player.score?.totalRounded ?? score;
      const entry = totals.get(player.playerId) ?? {
        playerId: player.playerId,
        playerName: player.playerName,
        teamName: player.teamName,
        position: player.position,
        games: 0,
        totalPoints: 0,
        totalRounded: 0,
        goals: 0,
        assists: 0,
      };
      entry.games += 1;
      entry.totalPoints += score;
      entry.totalRounded += totalRounded;
      entry.goals += toNumber(player.stats?.goals);
      entry.assists += toNumber(player.stats?.assists);
      totals.set(player.playerId, entry);
    }
  }

  const players = Array.from(totals.values());
  const topFantasy = players.slice().sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 15);
  const topGoals = players.slice().sort((a, b) => b.goals - a.goals).slice(0, 10);
  const topAssists = players.slice().sort((a, b) => b.assists - a.assists).slice(0, 10);

  const currentCompetition = SOCCER_COMPETITIONS.find(
    (item) => item.id === competitionId && item.seasonId === seasonId
  );

  return (
    <SoccerPageShell title="Soccer advanced stats" description="StatsBomb Open Data sample leaders.">
      <section className="mt-6 flex flex-wrap gap-3">
        {SOCCER_COMPETITIONS.map((comp) => (
          <Link
            key={`${comp.id}-${comp.seasonId}`}
            className={`rounded-full border px-4 py-2 text-sm ${
              comp.id === competitionId && comp.seasonId === seasonId
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/soccer/advanced-stats${buildQuery({
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
          Showing {safeLimit} matches · {currentCompetition?.label ?? "Competition"}. Stats include goals, assists, and fantasy scoring.
        </p>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Fantasy points leaders
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Games</th>
                <th className="px-3 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {topFantasy.map((row) => (
                <tr key={row.playerId} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.playerName}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.teamName ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.games}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.totalRounded.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Goals & assists leaders
          </div>
          <div className="grid grid-cols-1 gap-4 p-4 text-sm md:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Goals</div>
              <ul className="mt-2 space-y-1">
                {topGoals.map((row) => (
                  <li key={`goal-${row.playerId}`} className="text-black dark:text-white">
                    {row.playerName} · {row.goals}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Assists</div>
              <ul className="mt-2 space-y-1">
                {topAssists.map((row) => (
                  <li key={`assist-${row.playerId}`} className="text-black dark:text-white">
                    {row.playerName} · {row.assists}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
        <p>Stats are derived from StatsBomb Open Data match events and our fantasy scoring model.</p>
      </section>
    </SoccerPageShell>
  );
}
