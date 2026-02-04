import Link from "next/link";
import { getBaseUrl } from "@/lib/serverBaseUrl";
import NflPageShell from "../_components/NflPageShell";

const SAMPLE_SEASONS = [2021, 2022, 2023];
const SEASON_TYPES = ["REG", "POST", "PRE"] as const;

type WeeklyRow = {
  player_id: string;
  player_display_name: string;
  team?: string;
  position?: string;
  stats?: {
    passing_yards?: number;
    rushing_yards?: number;
    receiving_yards?: number;
    passing_td?: number;
    rushing_td?: number;
    receiving_td?: number;
    receptions?: number;
  };
  usage?: {
    airYards?: number;
    targetShare?: number;
    airYardsShare?: number;
    wopr?: number;
    racr?: number;
    pacr?: number;
    passingEpa?: number;
    rushingEpa?: number;
    receivingEpa?: number;
    fantasyPoints?: number;
    fantasyPointsPpr?: number;
  };
};

type WeeklyResponse = {
  rows?: WeeklyRow[];
};

type ScheduleResponse = {
  weeks: number[];
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

function toNumber(value: number | undefined): number {
  return Number(value ?? 0) || 0;
}

function formatDecimal(value: number | undefined, digits = 2): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

function formatPercent(value: number | undefined, digits = 1): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export default async function NflAdvancedStatsPage({
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

  const weeklyRes = await fetch(
    `${baseUrl}/api/stats/nfl/weekly?season=${season}&week=${week}&season_type=${seasonType}`,
    { next: { revalidate: 3600 } }
  );
  const weekly = (await weeklyRes.json()) as WeeklyResponse;
  const rows = weekly.rows ?? [];

  const topPassing = rows
    .slice()
    .sort((a, b) => toNumber(b.stats?.passing_yards) - toNumber(a.stats?.passing_yards))
    .slice(0, 10);

  const topRushing = rows
    .slice()
    .sort((a, b) => toNumber(b.stats?.rushing_yards) - toNumber(a.stats?.rushing_yards))
    .slice(0, 10);

  const topReceiving = rows
    .slice()
    .sort((a, b) => toNumber(b.stats?.receiving_yards) - toNumber(a.stats?.receiving_yards))
    .slice(0, 10);

  const topTd = rows
    .slice()
    .map((row) => {
      const passing = toNumber(row.stats?.passing_td);
      const rushing = toNumber(row.stats?.rushing_td);
      const receiving = toNumber(row.stats?.receiving_td);
      return {
        ...row,
        tdTotal: passing + rushing + receiving,
      };
    })
    .sort((a, b) => b.tdTotal - a.tdTotal)
    .slice(0, 10);

  const topAirYards = rows
    .slice()
    .sort((a, b) => toNumber(b.usage?.airYards) - toNumber(a.usage?.airYards))
    .slice(0, 10);

  const topTargetShare = rows
    .slice()
    .sort((a, b) => toNumber(b.usage?.targetShare) - toNumber(a.usage?.targetShare))
    .slice(0, 10);

  const topWopr = rows
    .slice()
    .sort((a, b) => toNumber(b.usage?.wopr) - toNumber(a.usage?.wopr))
    .slice(0, 10);

  const topPassEpa = rows
    .slice()
    .sort((a, b) => toNumber(b.usage?.passingEpa) - toNumber(a.usage?.passingEpa))
    .slice(0, 10);

  const topRushEpa = rows
    .slice()
    .sort((a, b) => toNumber(b.usage?.rushingEpa) - toNumber(a.usage?.rushingEpa))
    .slice(0, 10);

  const topRecEpa = rows
    .slice()
    .sort((a, b) => toNumber(b.usage?.receivingEpa) - toNumber(a.usage?.receivingEpa))
    .slice(0, 10);

  return (
    <NflPageShell title="NFL advanced stats" description="Weekly leaders from nflverse player stats.">
      <section className="mt-6 flex flex-wrap gap-3">
        {SAMPLE_SEASONS.map((year) => (
          <Link
            key={year}
            className={`rounded-full border px-4 py-2 text-sm ${
              year === season
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/advanced-stats${buildQuery({ season: String(year), week: params.week, season_type: seasonType })}`}
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
            href={`/nfl/advanced-stats${buildQuery({ season: String(season), week: params.week, season_type: type })}`}
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
            href={`/nfl/advanced-stats${buildQuery({ season: String(season), week: String(wk), season_type: seasonType })}`}
          >
            Week {wk}
          </Link>
        ))}
      </section>

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Passing yards leaders
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Yards</th>
                <th className="px-3 py-2">TD</th>
              </tr>
            </thead>
            <tbody>
              {topPassing.map((row) => (
                <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.stats?.passing_yards ?? 0}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.stats?.passing_td ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Rushing yards leaders
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Yards</th>
                <th className="px-3 py-2">TD</th>
              </tr>
            </thead>
            <tbody>
              {topRushing.map((row) => (
                <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.stats?.rushing_yards ?? 0}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.stats?.rushing_td ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Receiving yards leaders
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Yards</th>
                <th className="px-3 py-2">Rec</th>
              </tr>
            </thead>
            <tbody>
              {topReceiving.map((row) => (
                <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.stats?.receiving_yards ?? 0}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.stats?.receptions ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Total TD leaders
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">TD</th>
              </tr>
            </thead>
            <tbody>
              {topTd.map((row) => (
                <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.tdTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Air yards leaders
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Air Yds</th>
              </tr>
            </thead>
            <tbody>
              {topAirYards.map((row) => (
                <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {formatDecimal(row.usage?.airYards, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Target share leaders
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Tgt%</th>
              </tr>
            </thead>
            <tbody>
              {topTargetShare.map((row) => (
                <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {formatPercent(row.usage?.targetShare)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            WOPR leaders
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">WOPR</th>
              </tr>
            </thead>
            <tbody>
              {topWopr.map((row) => (
                <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {formatDecimal(row.usage?.wopr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Passing EPA leaders
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">EPA</th>
              </tr>
            </thead>
            <tbody>
              {topPassEpa.map((row) => (
                <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {formatDecimal(row.usage?.passingEpa)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Rushing EPA leaders
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">EPA</th>
              </tr>
            </thead>
            <tbody>
              {topRushEpa.map((row) => (
                <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {formatDecimal(row.usage?.rushingEpa)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Receiving EPA leaders
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">EPA</th>
              </tr>
            </thead>
            <tbody>
              {topRecEpa.map((row) => (
                <tr key={row.player_id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.player_display_name}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {formatDecimal(row.usage?.receivingEpa)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Stat definitions match nflverse raw player stats for the selected week. Usage + EPA metrics come from nflverse
          weekly player stats fields.
        </p>
      </section>
    </NflPageShell>
  );
}
