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

export default async function SoccerAnalyticsPage({
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

  const scores: number[] = [];
  const positionMap = new Map<string, { count: number; total: number; max: number }>();
  const teamMap = new Map<string, { count: number; total: number; max: number }>();

  for (const match of data.matches ?? []) {
    for (const player of match.players ?? []) {
      const score = player.score?.total ?? 0;
      scores.push(score);

      const position = player.position ?? "UNK";
      const team = player.teamName ?? "UNK";

      const posEntry = positionMap.get(position) ?? { count: 0, total: 0, max: 0 };
      posEntry.count += 1;
      posEntry.total += score;
      posEntry.max = Math.max(posEntry.max, score);
      positionMap.set(position, posEntry);

      const teamEntry = teamMap.get(team) ?? { count: 0, total: 0, max: 0 };
      teamEntry.count += 1;
      teamEntry.total += score;
      teamEntry.max = Math.max(teamEntry.max, score);
      teamMap.set(team, teamEntry);
    }
  }

  const sortedScores = scores.slice().sort((a, b) => a - b);
  const totalPlayers = sortedScores.length;
  const average = totalPlayers ? sortedScores.reduce((acc, val) => acc + val, 0) / totalPlayers : 0;
  const median =
    totalPlayers === 0
      ? 0
      : totalPlayers % 2 === 1
        ? sortedScores[Math.floor(totalPlayers / 2)]
        : (sortedScores[totalPlayers / 2 - 1] + sortedScores[totalPlayers / 2]) / 2;

  const positions = Array.from(positionMap.entries()).map(([position, entry]) => ({
    position,
    avg: entry.count ? entry.total / entry.count : 0,
    max: entry.max,
    count: entry.count,
  }));
  positions.sort((a, b) => b.avg - a.avg);

  const teams = Array.from(teamMap.entries()).map(([team, entry]) => ({
    team,
    avg: entry.count ? entry.total / entry.count : 0,
    max: entry.max,
    count: entry.count,
  }));
  teams.sort((a, b) => b.avg - a.avg);

  const currentCompetition = SOCCER_COMPETITIONS.find(
    (item) => item.id === competitionId && item.seasonId === seasonId
  );

  return (
    <SoccerPageShell title="Soccer analytics" description="Fantasy scoring summaries for recent matches.">
      <section className="mt-6 flex flex-wrap gap-3">
        {SOCCER_COMPETITIONS.map((comp) => (
          <Link
            key={`${comp.id}-${comp.seasonId}`}
            className={`rounded-full border px-4 py-2 text-sm ${
              comp.id === competitionId && comp.seasonId === seasonId
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/soccer/analytics${buildQuery({
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
          Showing {safeLimit} matches · {currentCompetition?.label ?? "Competition"}. Total players: {totalPlayers}.
        </p>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Average score</div>
          <div className="mt-2 text-2xl font-semibold text-black dark:text-white">{average.toFixed(2)}</div>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Median score</div>
          <div className="mt-2 text-2xl font-semibold text-black dark:text-white">{median.toFixed(2)}</div>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Matches</div>
          <div className="mt-2 text-2xl font-semibold text-black dark:text-white">{data.matchCount}</div>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Position averages
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Position</th>
                <th className="px-3 py-2">Avg</th>
                <th className="px-3 py-2">Max</th>
                <th className="px-3 py-2">Samples</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((row) => (
                <tr key={row.position} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.position}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.avg.toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.max.toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Team averages (top 10)
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Avg</th>
                <th className="px-3 py-2">Max</th>
                <th className="px-3 py-2">Samples</th>
              </tr>
            </thead>
            <tbody>
              {teams.slice(0, 10).map((row) => (
                <tr key={row.team} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.team}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.avg.toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.max.toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </SoccerPageShell>
  );
}
