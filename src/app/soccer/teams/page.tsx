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
  team?: { id?: number; name?: string };
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

export default async function SoccerTeamsPage() {
  const results = await Promise.all(
    LEAGUES.map(async (league) => {
      const rows = await fetchLeagueRows(league.code);
      return { league, rows };
    })
  );

  return (
    <SoccerPageShell title="Soccer teams" description="Clubs from the top European leagues.">
      <section className="mt-8 grid grid-cols-1 gap-6">
        {results.map(({ league, rows }) => (
          <div key={league.code} className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{league.label}</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 md:grid-cols-4">
              {rows.map((row) => (
                <div key={row.team?.id ?? row.team?.name} className="text-black dark:text-white">
                  {row.team?.name}
                </div>
              ))}
              {rows.length === 0 ? (
                <div className="col-span-full text-sm text-zinc-500 dark:text-zinc-400">No data available.</div>
              ) : null}
            </div>
          </div>
        ))}
      </section>
    </SoccerPageShell>
  );
}
