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

function formatMatchLabel(match: { matchDate?: string; homeTeam?: string; awayTeam?: string }) {
  const date = match.matchDate ? match.matchDate.slice(0, 10) : "";
  const home = match.homeTeam ?? "Home";
  const away = match.awayTeam ?? "Away";
  return `${date} ${home} vs ${away}`.trim();
}

type MatrixRow = {
  playerId: number;
  playerName: string;
  teamName?: string;
  position?: string;
  total: number;
  average: number;
  scores: Array<number | null>;
};

export default async function SoccerTournamentMatrixPage({
  searchParams,
}: {
  searchParams: Promise<{ competition?: string; season?: string; limit?: string; top?: string }>;
}) {
  const params = await searchParams;
  const competitionId = Number(params.competition ?? SOCCER_COMPETITIONS[0].id);
  const seasonId = Number(params.season ?? SOCCER_COMPETITIONS[0].seasonId);
  const limit = Number(params.limit ?? "12");
  const safeLimit = Number.isFinite(limit) ? Math.max(4, Math.min(30, limit)) : 12;
  const top = Math.min(100, Math.max(10, Number(params.top ?? "25") || 25));

  const data = await fetchSoccerCompetitionScores({
    competitionId,
    seasonId,
    limit: safeLimit,
  });

  const matches = data.matches ?? [];
  const matchLabels = matches.map((match) => formatMatchLabel(match));

  const playerMap = new Map<number, MatrixRow>();

  matches.forEach((match, matchIndex) => {
    for (const player of match.players ?? []) {
      const score = player.score?.total ?? 0;
      const entry = playerMap.get(player.playerId) ?? {
        playerId: player.playerId,
        playerName: player.playerName,
        teamName: player.teamName,
        position: player.position,
        total: 0,
        average: 0,
        scores: Array.from({ length: matches.length }, () => null),
      };
      entry.total += score;
      entry.scores[matchIndex] = score;
      playerMap.set(player.playerId, entry);
    }
  });

  const rows = Array.from(playerMap.values()).map((row) => ({
    ...row,
    average: matches.length ? row.total / matches.length : 0,
  }));

  rows.sort((a, b) => b.total - a.total);

  const selected = SOCCER_COMPETITIONS.find(
    (comp) => comp.id === competitionId && comp.seasonId === seasonId
  );

  return (
    <SoccerPageShell title="Soccer tournament matrix" description="Match-by-match fantasy scoring matrix.">
      <section className="mt-6 flex flex-wrap gap-3">
        {SOCCER_COMPETITIONS.map((comp) => (
          <Link
            key={`${comp.id}-${comp.seasonId}`}
            className={`rounded-full border px-4 py-2 text-sm ${
              comp.id === competitionId && comp.seasonId === seasonId
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/soccer/tournament-matrix${buildQuery({
              competition: String(comp.id),
              season: String(comp.seasonId),
              limit: String(safeLimit),
              top: String(top),
            })}`}
          >
            {comp.label}
          </Link>
        ))}
      </section>

      <form className="mt-6 flex flex-wrap items-end gap-3" method="GET">
        <input type="hidden" name="competition" value={String(competitionId)} />
        <input type="hidden" name="season" value={String(seasonId)} />
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Match limit
          <input
            name="limit"
            defaultValue={safeLimit}
            className="mt-1 block w-24 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Top
          <input
            name="top"
            defaultValue={top}
            className="mt-1 block w-20 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <button
          type="submit"
          className="rounded-md border border-black/10 bg-black px-4 py-2 text-sm text-white hover:bg-zinc-800 dark:border-white/10 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Update
        </button>
      </form>

      <section className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          {selected?.label ?? "Competition"} · {matches.length} matches.
        </p>
      </section>

      <section className="mt-8">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Match matrix
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Pos</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Avg</th>
                  {matchLabels.map((label, idx) => (
                    <th key={`${label}-${idx}`} className="px-3 py-2">
                      {`M${idx + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, top).map((row) => (
                  <tr key={row.playerId} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{row.playerName}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.teamName ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.position ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.total.toFixed(1)}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.average.toFixed(1)}</td>
                    {row.scores.map((score, idx) => (
                      <td key={`${row.playerId}-${idx}`} className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                        {score !== null ? score.toFixed(1) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mt-6 text-xs text-zinc-500 dark:text-zinc-400">
        <p>
          Match labels: {matchLabels.join(" · ")}
        </p>
      </section>
    </SoccerPageShell>
  );
}
