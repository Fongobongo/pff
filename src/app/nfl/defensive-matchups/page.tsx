import Link from "next/link";
import { getBaseUrl } from "@/lib/serverBaseUrl";
import NflPageShell from "../_components/NflPageShell";

const SAMPLE_SEASONS = [2021, 2022, 2023];
const SEASON_TYPES = ["REG", "POST", "PRE"] as const;
const POSITIONS = ["QB", "RB", "WR", "TE"] as const;

type ScheduleResponse = {
  weeks: number[];
};

type ScoreWeekRow = {
  opponent_team?: string;
  position?: string;
  score?: { total?: number; totalRounded?: number };
};

type ScoreWeekResponse = {
  rows: ScoreWeekRow[];
};

type DefenseRow = {
  team: string;
  averages: Record<string, number>;
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

function scoreValue(row: ScoreWeekRow): number {
  const val = row.score?.totalRounded ?? row.score?.total ?? 0;
  return Number(val) || 0;
}

export default async function NflDefensiveMatchupsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; week?: string; season_type?: string }>;
}) {
  const params = await searchParams;
  const rawSeason = Number(params.season ?? "2023");
  const season = Number.isFinite(rawSeason) ? rawSeason : 2023;
  const seasonType = (params.season_type ?? "REG").toUpperCase();
  const rawWeek = params.week ? Number(params.week) : undefined;
  const requestedWeek = rawWeek !== undefined && Number.isFinite(rawWeek) ? rawWeek : undefined;

  const baseUrl = await getBaseUrl();
  const scheduleRes = await fetch(
    `${baseUrl}/api/stats/nfl/schedule?season=${season}&game_type=${seasonType}`,
    { next: { revalidate: 3600 } }
  );
  const schedule = (await scheduleRes.json()) as ScheduleResponse;
  const weeks = schedule.weeks.length ? schedule.weeks : [1];
  const week = requestedWeek && weeks.includes(requestedWeek) ? requestedWeek : weeks[weeks.length - 1];

  const scoreRes = await fetch(
    `${baseUrl}/api/stats/nfl/score-week?season=${season}&week=${week}&season_type=${seasonType}`,
    { next: { revalidate: 3600 } }
  );
  const scores = (await scoreRes.json()) as ScoreWeekResponse;

  const defenseMap = new Map<string, Record<string, { total: number; count: number }>>();

  for (const row of scores.rows) {
    const defense = row.opponent_team;
    const position = row.position?.toUpperCase();
    if (!defense || !position) continue;
    if (!POSITIONS.includes(position as (typeof POSITIONS)[number])) continue;

    const score = scoreValue(row);
    const entry = defenseMap.get(defense) ?? {};
    const posEntry = entry[position] ?? { total: 0, count: 0 };
    posEntry.total += score;
    posEntry.count += 1;
    entry[position] = posEntry;
    defenseMap.set(defense, entry);
  }

  const defenseRows: DefenseRow[] = Array.from(defenseMap.entries()).map(([team, values]) => {
    const averages: Record<string, number> = {};
    for (const pos of POSITIONS) {
      const entry = values[pos];
      averages[pos] = entry && entry.count > 0 ? entry.total / entry.count : 0;
    }
    return { team, averages };
  });

  const sortedRows = defenseRows.slice().sort((a, b) => a.team.localeCompare(b.team));

  const matchupLeaders = POSITIONS.map((pos) => {
    const sorted = defenseRows.slice().sort((a, b) => b.averages[pos] - a.averages[pos]);
    return {
      pos,
      easiest: sorted.slice(0, 5),
      toughest: sorted.slice(-5).reverse(),
    };
  });

  return (
    <NflPageShell title="NFL defensive matchups" description="Fantasy points allowed by defense and position.">
      <section className="mt-6 flex flex-wrap gap-3">
        {SAMPLE_SEASONS.map((year) => (
          <Link
            key={year}
            className={`rounded-full border px-4 py-2 text-sm ${
              year === season
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/defensive-matchups${buildQuery({ season: String(year), week: params.week, season_type: seasonType })}`}
          >
            {year}
          </Link>
        ))}
        {SEASON_TYPES.map((type) => (
          <Link
            key={type}
            className={`rounded-full border px-3 py-2 text-xs ${
              type === seasonType
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/defensive-matchups${buildQuery({ season: String(season), week: params.week, season_type: type })}`}
          >
            {type}
          </Link>
        ))}
      </section>

      <section className="mt-4 flex flex-wrap gap-2">
        {weeks.map((wk) => (
          <Link
            key={wk}
            className={`rounded-full border px-3 py-1 text-xs ${
              wk === week
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/defensive-matchups${buildQuery({ season: String(season), week: String(wk), season_type: seasonType })}`}
          >
            Week {wk}
          </Link>
        ))}
      </section>

      <section className="mt-8">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Defensive matchup matrix (avg fantasy points allowed)
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Defense</th>
                {POSITIONS.map((pos) => (
                  <th key={pos} className="px-3 py-2">
                    {pos}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.team} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.team}</td>
                  {POSITIONS.map((pos) => (
                    <td key={pos} className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.averages[pos].toFixed(1)}
                    </td>
                  ))}
                </tr>
              ))}
              {sortedRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={POSITIONS.length + 1}>
                    No defensive matchup data for this week.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {matchupLeaders.map((group) => (
          <div key={group.pos} className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{group.pos} matchups</div>
            <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-zinc-500 dark:text-zinc-400">Best</div>
                <ul className="mt-2 space-y-1">
                  {group.easiest.map((row) => (
                    <li key={`${group.pos}-${row.team}`} className="text-black dark:text-white">
                      {row.team} · {row.averages[group.pos].toFixed(1)}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-zinc-500 dark:text-zinc-400">Toughest</div>
                <ul className="mt-2 space-y-1">
                  {group.toughest.map((row) => (
                    <li key={`${group.pos}-${row.team}`} className="text-black dark:text-white">
                      {row.team} · {row.averages[group.pos].toFixed(1)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </section>
    </NflPageShell>
  );
}
