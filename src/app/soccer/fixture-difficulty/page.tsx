import { getBaseUrl } from "@/lib/serverBaseUrl";
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
  points?: number;
};

type FootballDataStandingsEntry = {
  type?: string;
  table?: FootballDataStandingsRow[];
};

type StandingsResponse = {
  standings?: { standings?: FootballDataStandingsEntry[] };
  table?: FootballDataStandingsRow[];
};

function extractRows(data: StandingsResponse): FootballDataStandingsRow[] {
  const standings = data.standings?.standings ?? [];
  const table = standings.find((item) => item.type === "TOTAL") ?? standings[0];
  return data.table ?? table?.table ?? [];
}

export default async function SoccerFixtureDifficultyPage() {
  const baseUrl = await getBaseUrl();

  const results = await Promise.all(
    LEAGUES.map(async (league) => {
      const res = await fetch(`${baseUrl}/api/football-data/standings?competition=${league.code}`, {
        next: { revalidate: 300 },
      });
      const data = (await res.json()) as StandingsResponse;
      const rows = extractRows(data);
      const sorted = rows.slice().sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
      return {
        league,
        toughest: sorted.slice(0, 5),
        easiest: sorted.slice(-5).reverse(),
      };
    })
  );

  return (
    <SoccerPageShell title="Fixture difficulty" description="A simple difficulty proxy based on league standings.">
      <section className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          This uses current points as a proxy for fixture difficulty. Higher-ranked teams = tougher matchups.
        </p>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6">
        {results.map(({ league, toughest, easiest }) => (
          <div key={league.code} className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{league.label}</div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Toughest</div>
                <ul className="mt-2 space-y-1 text-sm">
                  {toughest.map((row) => (
                    <li key={row.team?.id ?? row.team?.name} className="text-black dark:text-white">
                      {row.team?.name} · {row.points ?? 0} pts
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Easiest</div>
                <ul className="mt-2 space-y-1 text-sm">
                  {easiest.map((row) => (
                    <li key={row.team?.id ?? row.team?.name} className="text-black dark:text-white">
                      {row.team?.name} · {row.points ?? 0} pts
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </section>
    </SoccerPageShell>
  );
}
