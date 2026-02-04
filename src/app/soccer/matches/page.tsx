import { footballDataFetch } from "@/lib/footballdata";
import SoccerPageShell from "../_components/SoccerPageShell";

const LEAGUES = [
  { code: "PL", label: "Premier League" },
  { code: "PD", label: "La Liga" },
  { code: "BL1", label: "Bundesliga" },
  { code: "SA", label: "Serie A" },
  { code: "FL1", label: "Ligue 1" },
] as const;

type MatchRow = {
  id: number;
  utcDate?: string;
  status?: string;
  homeTeam?: { name?: string };
  awayTeam?: { name?: string };
  score?: { fullTime?: { home?: number | null; away?: number | null } };
};

type FootballDataMatchesResponse = {
  matches?: MatchRow[];
};

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function toDateParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function SoccerMatchesPage() {
  const today = new Date();
  const end = new Date();
  end.setDate(today.getDate() + 7);
  const dateFrom = toDateParam(today);
  const dateTo = toDateParam(end);

  const results = await Promise.all(
    LEAGUES.map(async (league) => {
      try {
        const data = await footballDataFetch<FootballDataMatchesResponse>(
          `/competitions/${league.code}/matches`,
          {
            dateFrom,
            dateTo,
            status: "SCHEDULED",
          },
          300
        );
        return { league, matches: (data.matches ?? []).slice(0, 50) };
      } catch {
        return { league, matches: [] };
      }
    })
  );

  return (
    <SoccerPageShell title="Soccer matches" description="Upcoming fixtures for the next 7 days.">
      <section className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        <p>Showing matches from {dateFrom} to {dateTo}.</p>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6">
        {results.map(({ league, matches }) => (
          <div key={league.code} className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              {league.label}
            </div>
            {matches.length ? (
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Match</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((match) => (
                    <tr key={match.id} className="border-t border-black/10 dark:border-white/10">
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatDate(match.utcDate)}</td>
                      <td className="px-3 py-2 text-black dark:text-white">
                        {match.homeTeam?.name} vs {match.awayTeam?.name}
                      </td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{match.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-3 py-4 text-sm text-zinc-600 dark:text-zinc-400">No upcoming matches.</div>
            )}
          </div>
        ))}
      </section>
    </SoccerPageShell>
  );
}
