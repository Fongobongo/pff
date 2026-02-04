import Link from "next/link";
import SoccerPageShell from "../_components/SoccerPageShell";
import { SOCCER_COMPETITIONS, fetchSoccerCompetitionScores } from "@/lib/soccerStats";

const LIMIT_OPTIONS = [20, 50, 100, 200];

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

function percentile(sorted: number[], pct: number): number {
  if (!sorted.length) return 0;
  const rank = (pct / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function formatNumber(value: number, digits = 2): string {
  return value.toFixed(digits);
}

export default async function SoccerAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ competition?: string; season?: string; limit?: string; position?: string; team?: string }>;
}) {
  const params = await searchParams;
  const competitionId = Number(params.competition ?? SOCCER_COMPETITIONS[0].id);
  const seasonId = Number(params.season ?? SOCCER_COMPETITIONS[0].seasonId);
  const limit = Number(params.limit ?? "20");
  const safeLimit = Number.isFinite(limit) ? Math.max(4, Math.min(200, limit)) : 20;
  const positionFilter = params.position?.toUpperCase();
  const teamFilter = params.team?.toUpperCase();

  const data = await fetchSoccerCompetitionScores({
    competitionId,
    seasonId,
    limit: safeLimit,
    recent: true,
  });

  const samples: Array<{
    playerId: number;
    playerName: string;
    teamName?: string;
    position?: string;
    score: number;
    minutes: number;
    xg: number;
    xa: number;
    assists: number;
  }> = [];

  for (const match of data.matches ?? []) {
    for (const player of match.players ?? []) {
      samples.push({
        playerId: player.playerId,
        playerName: player.playerName,
        teamName: player.teamName,
        position: player.position,
        score: player.score?.total ?? 0,
        minutes: toNumber(player.minutesPlayed),
        xg: toNumber(player.xg),
        xa: toNumber(player.xa),
        assists: toNumber(player.stats?.assists),
      });
    }
  }

  const positionOptions = Array.from(
    new Set(samples.map((row) => row.position).filter((value): value is string => Boolean(value)))
  ).sort();
  const teamOptions = Array.from(
    new Set(samples.map((row) => row.teamName).filter((value): value is string => Boolean(value)))
  ).sort();

  let filtered = samples;
  if (positionFilter) {
    filtered = filtered.filter((row) => (row.position ?? "").toUpperCase() === positionFilter);
  }
  if (teamFilter) {
    filtered = filtered.filter((row) => (row.teamName ?? "").toUpperCase() === teamFilter);
  }

  const scores = filtered.map((row) => row.score);
  const sortedScores = scores.slice().sort((a, b) => a - b);
  const totalPlayers = sortedScores.length;
  const average = totalPlayers ? sortedScores.reduce((acc, val) => acc + val, 0) / totalPlayers : 0;
  const median =
    totalPlayers === 0
      ? 0
      : totalPlayers % 2 === 1
        ? sortedScores[Math.floor(totalPlayers / 2)]
        : (sortedScores[totalPlayers / 2 - 1] + sortedScores[totalPlayers / 2]) / 2;
  const percentileRows = [50, 75, 90, 95].map((pct) => ({
    pct,
    value: percentile(sortedScores, pct),
  }));

  const positionMap = new Map<
    string,
    { count: number; total: number; max: number; xg: number; xa: number; minutes: number }
  >();
  const teamMap = new Map<
    string,
    { count: number; total: number; max: number; xg: number; xa: number; minutes: number }
  >();
  const leaderMap = new Map<
    number,
    { playerName: string; teamName?: string; xg: number; xa: number; assists: number; xgxa: number }
  >();

  for (const row of filtered) {
    const position = row.position ?? "UNK";
    const team = row.teamName ?? "UNK";

    const posEntry = positionMap.get(position) ?? {
      count: 0,
      total: 0,
      max: 0,
      xg: 0,
      xa: 0,
      minutes: 0,
    };
    posEntry.count += 1;
    posEntry.total += row.score;
    posEntry.max = Math.max(posEntry.max, row.score);
    posEntry.xg += row.xg;
    posEntry.xa += row.xa;
    posEntry.minutes += row.minutes;
    positionMap.set(position, posEntry);

    const teamEntry = teamMap.get(team) ?? {
      count: 0,
      total: 0,
      max: 0,
      xg: 0,
      xa: 0,
      minutes: 0,
    };
    teamEntry.count += 1;
    teamEntry.total += row.score;
    teamEntry.max = Math.max(teamEntry.max, row.score);
    teamEntry.xg += row.xg;
    teamEntry.xa += row.xa;
    teamEntry.minutes += row.minutes;
    teamMap.set(team, teamEntry);

    const leader = leaderMap.get(row.playerId) ?? {
      playerName: row.playerName,
      teamName: row.teamName,
      xg: 0,
      xa: 0,
      assists: 0,
      xgxa: 0,
    };
    leader.xg += row.xg;
    leader.xa += row.xa;
    leader.assists += row.assists;
    leader.xgxa += row.xg + row.xa;
    leaderMap.set(row.playerId, leader);
  }

  const positions = Array.from(positionMap.entries()).map(([position, entry]) => {
    const minutes = entry.minutes;
    const xgPer90 = minutes > 0 ? (entry.xg / minutes) * 90 : 0;
    const xaPer90 = minutes > 0 ? (entry.xa / minutes) * 90 : 0;
    return {
      position,
      avg: entry.count ? entry.total / entry.count : 0,
      max: entry.max,
      count: entry.count,
      xgPer90,
      xaPer90,
    };
  });
  positions.sort((a, b) => b.avg - a.avg);

  const teams = Array.from(teamMap.entries()).map(([team, entry]) => {
    const minutes = entry.minutes;
    const xgPer90 = minutes > 0 ? (entry.xg / minutes) * 90 : 0;
    const xaPer90 = minutes > 0 ? (entry.xa / minutes) * 90 : 0;
    return {
      team,
      avg: entry.count ? entry.total / entry.count : 0,
      max: entry.max,
      count: entry.count,
      xgPer90,
      xaPer90,
    };
  });
  teams.sort((a, b) => b.avg - a.avg);

  const leaders = Array.from(leaderMap.values());
  const topXg = leaders.slice().sort((a, b) => b.xg - a.xg).slice(0, 8);
  const topXa = leaders.slice().sort((a, b) => b.xa - a.xa).slice(0, 8);
  const topAssists = leaders.slice().sort((a, b) => b.assists - a.assists).slice(0, 8);
  const topXgXa = leaders.slice().sort((a, b) => b.xgxa - a.xgxa).slice(0, 8);

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

      <section className="mt-4 flex flex-wrap gap-2">
        {LIMIT_OPTIONS.map((value) => (
          <Link
            key={value}
            className={`rounded-full border px-3 py-1 text-xs ${
              value === safeLimit
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/soccer/analytics${buildQuery({
              competition: String(competitionId),
              season: String(seasonId),
              limit: String(value),
              position: positionFilter,
              team: teamFilter,
            })}`}
          >
            {value} matches
          </Link>
        ))}
      </section>

      <form className="mt-6 flex flex-wrap items-end gap-3" method="GET">
        <input type="hidden" name="competition" value={competitionId} />
        <input type="hidden" name="season" value={seasonId} />
        <input type="hidden" name="limit" value={safeLimit} />
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Position
          <select
            name="position"
            defaultValue={positionFilter ?? ""}
            className="mt-1 block w-24 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            <option value="">All</option>
            {positionOptions.map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Team
          <select
            name="team"
            defaultValue={teamFilter ?? ""}
            className="mt-1 block w-44 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            <option value="">All</option>
            {teamOptions.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md border border-black/10 bg-black px-4 py-2 text-sm text-white hover:bg-zinc-800 dark:border-white/10 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Apply
        </button>
      </form>

      <section className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Showing {safeLimit} matches · {currentCompetition?.label ?? "Competition"}. Total players: {totalPlayers}. xG/xA
          are normalized per 90 minutes.
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

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Score percentiles
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Pct</th>
                <th className="px-3 py-2">Score</th>
              </tr>
            </thead>
            <tbody>
              {percentileRows.map((row) => (
                <tr key={row.pct} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.pct}%</td>
                  <td className="px-3 py-2 text-black dark:text-white">{formatNumber(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 text-sm text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 lg:col-span-2">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Filter context</div>
          <div className="mt-2">
            {positionFilter ? `Position: ${positionFilter}. ` : "All positions. "}
            {teamFilter ? `Team: ${teamFilter}. ` : "All teams. "}
            Samples: {totalPlayers}.
          </div>
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
                <th className="px-3 py-2">xG/90</th>
                <th className="px-3 py-2">xA/90</th>
                <th className="px-3 py-2">Samples</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((row) => (
                <tr key={row.position} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.position}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.avg.toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.max.toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.xgPer90.toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.xaPer90.toFixed(2)}</td>
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
                <th className="px-3 py-2">xG/90</th>
                <th className="px-3 py-2">xA/90</th>
                <th className="px-3 py-2">Samples</th>
              </tr>
            </thead>
            <tbody>
              {teams.slice(0, 10).map((row) => (
                <tr key={row.team} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.team}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.avg.toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.max.toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.xgPer90.toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.xaPer90.toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">xG leaders</div>
          <ul className="mt-3 space-y-1 text-sm">
            {topXg.map((row, idx) => (
              <li key={`xg-${row.playerName}-${idx}`} className="text-black dark:text-white">
                {row.playerName} · {row.xg.toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">xA leaders</div>
          <ul className="mt-3 space-y-1 text-sm">
            {topXa.map((row, idx) => (
              <li key={`xa-${row.playerName}-${idx}`} className="text-black dark:text-white">
                {row.playerName} · {row.xa.toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">xG + xA leaders</div>
          <ul className="mt-3 space-y-1 text-sm">
            {topXgXa.map((row, idx) => (
              <li key={`xgxa-${row.playerName}-${idx}`} className="text-black dark:text-white">
                {row.playerName} · {row.xgxa.toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Assist leaders</div>
          <ul className="mt-3 space-y-1 text-sm">
            {topAssists.map((row, idx) => (
              <li key={`assist-${row.playerName}-${idx}`} className="text-black dark:text-white">
                {row.playerName} · {row.assists}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </SoccerPageShell>
  );
}
