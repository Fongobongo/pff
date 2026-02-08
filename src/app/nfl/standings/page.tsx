import Link from "next/link";
import Image from "next/image";
import { getBaseUrl } from "@/lib/serverBaseUrl";
import NflPageShell from "../_components/NflPageShell";

const SAMPLE_SEASONS = [2021, 2022, 2023];
const GAME_TYPES = ["REG", "POST", "PRE"] as const;

const SORT_OPTIONS = [
  { key: "win_pct", label: "Win %" },
  { key: "point_diff", label: "Point diff" },
  { key: "squad_value", label: "Squad value" },
  { key: "avg_price", label: "Avg price" },
  { key: "tradeable_players", label: "Tradeable" },
] as const;

const ASSET_FILTER_OPTIONS = [
  { key: "all", label: "All teams" },
  { key: "tradeable", label: "With assets" },
  { key: "empty", label: "No assets" },
] as const;

type StandingAsset = {
  tokenIdDec: string;
  playerName: string;
  position?: string;
  priceUsd: number;
  priceChange24hPercent?: number;
};

type StandingsResponse = {
  season: number;
  gameType: string;
  asOf?: string;
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
    tradeablePlayers: number;
    squadValueUsd: number;
    avgPlayerPriceUsd: number;
    topAssets: StandingAsset[];
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

function formatUsd(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  if (abs >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

export default async function NflStandingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    season?: string;
    game_type?: string;
    sort?: string;
    dir?: string;
    asset_filter?: string;
  }>;
}) {
  const params = await searchParams;
  const rawSeason = Number(params.season ?? "2023");
  const season = Number.isFinite(rawSeason) ? rawSeason : 2023;
  const gameType = GAME_TYPES.includes((params.game_type ?? "REG").toUpperCase() as (typeof GAME_TYPES)[number])
    ? ((params.game_type ?? "REG").toUpperCase() as (typeof GAME_TYPES)[number])
    : "REG";

  const sort = SORT_OPTIONS.find((option) => option.key === params.sort)?.key ?? "win_pct";
  const dir = params.dir === "asc" ? "asc" : "desc";
  const assetFilter =
    ASSET_FILTER_OPTIONS.find((option) => option.key === params.asset_filter)?.key ?? "all";

  const baseUrl = await getBaseUrl();
  const res = await fetch(
    `${baseUrl}/api/stats/nfl/standings?season=${season}&game_type=${gameType}`,
    { next: { revalidate: 120 } }
  );
  const data = (await res.json()) as StandingsResponse;

  let rows = data.rows.slice();

  if (assetFilter === "tradeable") {
    rows = rows.filter((row) => row.tradeablePlayers > 0);
  } else if (assetFilter === "empty") {
    rows = rows.filter((row) => row.tradeablePlayers === 0);
  }

  rows.sort((a, b) => {
    const numeric = (left: number, right: number) => {
      if (left === right) return 0;
      const cmp = left > right ? 1 : -1;
      return dir === "asc" ? cmp : -cmp;
    };

    switch (sort) {
      case "point_diff": {
        const cmp = numeric(a.pointDiff, b.pointDiff);
        if (cmp !== 0) return cmp;
        break;
      }
      case "squad_value": {
        const cmp = numeric(a.squadValueUsd, b.squadValueUsd);
        if (cmp !== 0) return cmp;
        break;
      }
      case "avg_price": {
        const cmp = numeric(a.avgPlayerPriceUsd, b.avgPlayerPriceUsd);
        if (cmp !== 0) return cmp;
        break;
      }
      case "tradeable_players": {
        const cmp = numeric(a.tradeablePlayers, b.tradeablePlayers);
        if (cmp !== 0) return cmp;
        break;
      }
      case "win_pct":
      default: {
        const cmp = numeric(a.winPct, b.winPct);
        if (cmp !== 0) return cmp;
        break;
      }
    }

    if (a.pointDiff !== b.pointDiff) return b.pointDiff - a.pointDiff;
    if (a.pointsFor !== b.pointsFor) return b.pointsFor - a.pointsFor;
    return a.teamAbbr.localeCompare(b.teamAbbr);
  });

  const byConference = new Map<string, StandingsResponse["rows"]>();
  for (const row of rows) {
    const conf = row.conference ?? "Other";
    const list = byConference.get(conf) ?? [];
    list.push(row);
    byConference.set(conf, list);
  }

  return (
    <NflPageShell title="NFL standings" description="Standings + fantasy economics from nflverse and on-chain prices.">
      <section className="mt-6 flex flex-wrap gap-3">
        {SAMPLE_SEASONS.map((year) => (
          <Link
            key={year}
            className={`rounded-full border px-4 py-2 text-sm ${
              year === season
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/standings${buildQuery({
              season: String(year),
              game_type: gameType,
              sort,
              dir,
              asset_filter: assetFilter,
            })}`}
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
            href={`/nfl/standings${buildQuery({
              season: String(season),
              game_type: type,
              sort,
              dir,
              asset_filter: assetFilter,
            })}`}
          >
            {type}
          </Link>
        ))}
      </section>

      <section className="mt-4 flex flex-wrap gap-2">
        {SORT_OPTIONS.map((option) => {
          const active = sort === option.key;
          const nextDir = active && dir === "desc" ? "asc" : "desc";
          return (
            <Link
              key={option.key}
              className={`rounded-full border px-3 py-1 text-xs ${
                active
                  ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                  : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              }`}
              href={`/nfl/standings${buildQuery({
                season: String(season),
                game_type: gameType,
                sort: option.key,
                dir: nextDir,
                asset_filter: assetFilter,
              })}`}
            >
              {option.label} {active ? (dir === "desc" ? "↓" : "↑") : ""}
            </Link>
          );
        })}
      </section>

      <section className="mt-3 flex flex-wrap gap-2">
        {ASSET_FILTER_OPTIONS.map((option) => (
          <Link
            key={option.key}
            className={`rounded-full border px-3 py-1 text-xs ${
              option.key === assetFilter
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/standings${buildQuery({
              season: String(season),
              game_type: gameType,
              sort,
              dir,
              asset_filter: option.key,
            })}`}
          >
            {option.label}
          </Link>
        ))}
      </section>

      <section className="mt-4 text-xs text-zinc-600 dark:text-zinc-400">
        Updated {data.asOf ? new Date(data.asOf).toLocaleString() : "—"} · {rows.length} teams
      </section>

      {Array.from(byConference.entries()).map(([conf, confRows]) => (
        <section key={conf} className="mt-8">
          <h2 className="text-lg font-semibold text-black dark:text-white">{conf}</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <table className="w-full min-w-[1160px] text-left text-sm">
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
                  <th className="px-3 py-2">Tradeable</th>
                  <th className="px-3 py-2">Squad value</th>
                  <th className="px-3 py-2">Avg price</th>
                  <th className="px-3 py-2">Top assets</th>
                  <th className="px-3 py-2">Division</th>
                </tr>
              </thead>
              <tbody>
                {confRows.map((row) => (
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
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.tradeablePlayers}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatUsd(row.squadValueUsd)}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatUsd(row.avgPlayerPriceUsd)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.topAssets?.length
                        ? row.topAssets
                            .slice(0, 3)
                            .map((asset) => `${asset.playerName} (${formatUsd(asset.priceUsd)})`)
                            .join(" · ")
                        : "—"}
                    </td>
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
