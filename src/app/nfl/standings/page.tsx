import Link from "next/link";
import Image from "next/image";
import { getBaseUrl } from "@/lib/serverBaseUrl";
import NflPageShell from "../_components/NflPageShell";

const SAMPLE_SEASONS = [2021, 2022, 2023];
const GAME_TYPES = ["REG", "POST", "PRE"] as const;

type StandingsResponse = {
  season: number;
  gameType: string;
  rows: Array<{
    teamAbbr: string;
    teamName?: string;
    conference?: string;
    division?: string;
    wins: number;
    losses: number;
    ties: number;
    games: number;
    winPct: number;
    pointsFor: number;
    pointsAgainst: number;
    pointDiff: number;
    logo?: string;
  }>;
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

export default async function NflStandingsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; game_type?: string }>;
}) {
  const params = await searchParams;
  const rawSeason = Number(params.season ?? "2023");
  const season = Number.isFinite(rawSeason) ? rawSeason : 2023;
  const gameType = (params.game_type ?? "REG").toUpperCase();

  const baseUrl = await getBaseUrl();
  const res = await fetch(
    `${baseUrl}/api/stats/nfl/standings?season=${season}&game_type=${gameType}`,
    { next: { revalidate: 3600 } }
  );
  const data = (await res.json()) as StandingsResponse;

  const byConference = new Map<string, StandingsResponse["rows"]>();
  for (const row of data.rows) {
    const conf = row.conference ?? "Other";
    const list = byConference.get(conf) ?? [];
    list.push(row);
    byConference.set(conf, list);
  }

  return (
    <NflPageShell title="NFL standings" description="Computed from nflverse schedules and scores.">
      <section className="mt-6 flex flex-wrap gap-3">
        {SAMPLE_SEASONS.map((year) => (
          <Link
            key={year}
            className={`rounded-full border px-4 py-2 text-sm ${
              year === season
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/standings${buildQuery({ season: String(year), game_type: gameType })}`}
          >
            {year}
          </Link>
        ))}
        {GAME_TYPES.map((type) => (
          <Link
            key={type}
            className={`rounded-full border px-3 py-2 text-xs ${
              type === gameType
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/standings${buildQuery({ season: String(season), game_type: type })}`}
          >
            {type}
          </Link>
        ))}
      </section>

      {Array.from(byConference.entries()).map(([conf, rows]) => (
        <section key={conf} className="mt-8">
          <h2 className="text-lg font-semibold text-black dark:text-white">{conf}</h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">W</th>
                  <th className="px-3 py-2">L</th>
                  <th className="px-3 py-2">T</th>
                  <th className="px-3 py-2">Pct</th>
                  <th className="px-3 py-2">PF</th>
                  <th className="px-3 py-2">PA</th>
                  <th className="px-3 py-2">Diff</th>
                  <th className="px-3 py-2">Division</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.teamAbbr} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        {row.logo ? (
                          <Image
                            src={row.logo}
                            alt={row.teamName ?? row.teamAbbr}
                            width={24}
                            height={24}
                            className="h-6 w-6 rounded-sm object-contain"
                            unoptimized
                          />
                        ) : (
                          <div className="h-6 w-6 rounded-sm bg-black/10 dark:bg-white/10" />
                        )}
                        <span className="text-black dark:text-white">{row.teamName ?? row.teamAbbr}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.wins}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.losses}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.ties}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.winPct.toFixed(3)}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.pointsFor}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.pointsAgainst}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.pointDiff}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.division ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </NflPageShell>
  );
}
