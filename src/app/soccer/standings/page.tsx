import Link from "next/link";
import { footballDataFetch } from "@/lib/footballdata";
import SoccerPageShell from "../_components/SoccerPageShell";

const LEAGUES = [
  { code: "PL", label: "Premier League" },
  { code: "PD", label: "La Liga" },
  { code: "BL1", label: "Bundesliga" },
  { code: "SA", label: "Serie A" },
  { code: "FL1", label: "Ligue 1" },
] as const;

type FootballDataStandingsRow = {
  position?: number;
  team?: { id?: number; name?: string };
  playedGames?: number;
  won?: number;
  draw?: number;
  lost?: number;
  goalDifference?: number;
  points?: number;
};

type FootballDataStandingsEntry = {
  type?: string;
  table?: FootballDataStandingsRow[];
};

type FootballDataStandingsResponse = {
  standings?: FootballDataStandingsEntry[];
};

function extractRows(data: FootballDataStandingsResponse): FootballDataStandingsRow[] {
  const standings = data.standings ?? [];
  const table = standings.find((item) => item.type === "TOTAL") ?? standings[0];
  return table?.table ?? [];
}

async function fetchLeagueRows(competition: string): Promise<FootballDataStandingsRow[]> {
  try {
    const data = await footballDataFetch<FootballDataStandingsResponse>(
      `/competitions/${competition}/standings`,
      {},
      300
    );
    return extractRows(data);
  } catch {
    return [];
  }
}

export default async function SoccerStandingsPage() {
  const results = await Promise.all(
    LEAGUES.map(async (league) => {
      const rows = await fetchLeagueRows(league.code);
      return { league, rows };
    })
  );

  return (
    <SoccerPageShell title="Soccer standings" description="Top league tables from football-data.org.">
      <section className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        <p>Using football-data.org standings feeds for the major European leagues.</p>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6">
        {results.map(({ league, rows }) => (
          <div key={league.code} className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              {league.label}
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">P</th>
                  <th className="px-3 py-2">W</th>
                  <th className="px-3 py-2">D</th>
                  <th className="px-3 py-2">L</th>
                  <th className="px-3 py-2">GD</th>
                  <th className="px-3 py-2">Pts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.team?.id ?? row.position} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.position}</td>
                    <td className="px-3 py-2 text-black dark:text-white">{row.team?.name}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.playedGames}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.won}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.draw}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.lost}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.goalDifference}</td>
                    <td className="px-3 py-2 text-black dark:text-white">{row.points}</td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-sm text-zinc-500 dark:text-zinc-400" colSpan={8}>
                      No data available.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <div className="border-t border-black/10 px-3 py-2 text-xs text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              <Link className="hover:underline" href={`/football/standings?competition=${league.code}`}>
                View full standings
              </Link>
            </div>
          </div>
        ))}
      </section>
    </SoccerPageShell>
  );
}
