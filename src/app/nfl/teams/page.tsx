import Link from "next/link";
import Image from "next/image";
import { getBaseUrl } from "@/lib/serverBaseUrl";
import NflPageShell from "../_components/NflPageShell";
import NflMarketDiagnostics from "../_components/NflMarketDiagnostics";

const SORT_OPTIONS = [
  { key: "squad_value", label: "Squad value" },
  { key: "avg_price", label: "Avg price" },
  { key: "tradeable_players", label: "Tradeable" },
  { key: "team", label: "Team" },
] as const;

type TeamEconomicsResponse = {
  asOf: string;
  source: string;
  sort: string;
  dir: "asc" | "desc";
  rows: Array<{
    teamAbbr: string;
    teamName: string;
    conference?: string;
    division?: string;
    logo?: string;
    tradeablePlayers: number;
    squadValueUsd: number;
    avgPlayerPriceUsd: number;
    topAssets: Array<{
      tokenIdDec: string;
      playerName: string;
      position?: string;
      priceUsd: number;
      priceChange24hPercent?: number;
    }>;
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

function formatPercent(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export default async function NflTeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  const params = await searchParams;
  const sort = SORT_OPTIONS.find((option) => option.key === params.sort)?.key ?? "squad_value";
  const dir = params.dir === "asc" ? "asc" : "desc";

  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/stats/nfl/team-economics${buildQuery({ sort, dir })}`, {
    next: { revalidate: 120 },
  });
  const data = (await res.json()) as TeamEconomicsResponse;

  return (
    <NflPageShell title="NFL teams" description="Team economics from NFL market pricing.">
      <section className="mt-6 flex flex-wrap gap-2">
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
              href={`/nfl/teams${buildQuery({ sort: option.key, dir: nextDir })}`}
            >
              {option.label} {active ? (dir === "desc" ? "↓" : "↑") : ""}
            </Link>
          );
        })}
      </section>

      <section className="mt-4 text-xs text-zinc-600 dark:text-zinc-400">
        Updated {new Date(data.asOf).toLocaleString()} · {data.rows.length} teams
      </section>

      <NflMarketDiagnostics />

      <section className="mt-6">
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Conf</th>
                <th className="px-3 py-2">Div</th>
                <th className="px-3 py-2">Tradeable</th>
                <th className="px-3 py-2">Squad value</th>
                <th className="px-3 py-2">Avg player price</th>
                <th className="px-3 py-2">Top 3 assets</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((team) => (
                <tr key={team.teamAbbr} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      {team.logo ? (
                        <Image
                          src={team.logo}
                          alt={team.teamName}
                          width={24}
                          height={24}
                          className="h-6 w-6 rounded-sm object-contain"
                          unoptimized
                        />
                      ) : (
                        <div className="h-6 w-6 rounded-sm bg-black/10 dark:bg-white/10" />
                      )}
                      <div>
                        <div className="text-black dark:text-white">{team.teamName}</div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">{team.teamAbbr}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{team.conference ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{team.division ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{team.tradeablePlayers}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatUsd(team.squadValueUsd)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatUsd(team.avgPlayerPriceUsd)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {team.topAssets.length ? (
                      <div className="space-y-1">
                        {team.topAssets.map((asset) => (
                          <div key={`${team.teamAbbr}-${asset.tokenIdDec}`} className="flex flex-wrap gap-2">
                            <span className="text-black dark:text-white">{asset.playerName}</span>
                            {asset.position ? <span>({asset.position})</span> : null}
                            <span>{formatUsd(asset.priceUsd)}</span>
                            <span className={(asset.priceChange24hPercent ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"}>
                              {formatPercent(asset.priceChange24hPercent)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </NflPageShell>
  );
}
