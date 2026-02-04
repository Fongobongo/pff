import Link from "next/link";
import { getBaseUrl } from "@/lib/serverBaseUrl";
import NflPageShell from "../_components/NflPageShell";

const SAMPLE_SEASONS = [2021, 2022, 2023];
const PAGE_SIZE = 50;

type PlayersResponse = {
  page: number;
  pageSize: number;
  total: number;
  facets: {
    positions: string[];
    statuses: string[];
  };
  rows: Array<{
    playerId: string;
    displayName: string;
    position?: string;
    positionGroup?: string;
    latestTeam?: string;
    status?: string;
    lastSeason?: number;
  }>;
};

type TeamsResponse = {
  rows: Array<{
    teamAbbr: string;
    teamName: string;
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

export default async function NflPlayersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    team?: string;
    position?: string;
    status?: string;
    page?: string;
    season?: string;
  }>;
}) {
  const params = await searchParams;
  const rawSeason = Number(params.season ?? "2023");
  const season = Number.isFinite(rawSeason) ? rawSeason : 2023;
  const q = params.q ?? "";
  const team = params.team ?? "";
  const position = params.position ?? "";
  const status = params.status ?? "";
  const rawPage = Number(params.page ?? "1");
  const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;

  const baseUrl = await getBaseUrl();
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (team) query.set("team", team);
  if (position) query.set("position", position);
  if (status) query.set("status", status);
  query.set("page", String(page));
  query.set("page_size", String(PAGE_SIZE));

  const [playersRes, teamsRes] = await Promise.all([
    fetch(`${baseUrl}/api/stats/nfl/players?${query.toString()}`, { next: { revalidate: 3600 } }),
    fetch(`${baseUrl}/api/stats/nfl/teams`, { next: { revalidate: 86400 } }),
  ]);

  const players = (await playersRes.json()) as PlayersResponse;
  const teams = (await teamsRes.json()) as TeamsResponse;
  const totalPages = Math.max(1, Math.ceil(players.total / players.pageSize));

  return (
    <NflPageShell title="NFL players" description="Directory based on nflverse player registry.">
      <section className="mt-6 flex flex-wrap gap-3">
        {SAMPLE_SEASONS.map((year) => (
          <Link
            key={year}
            className={`rounded-full border px-4 py-2 text-sm ${
              year === season
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/players${buildQuery({ season: String(year), q, team, position, status })}`}
          >
            {year}
          </Link>
        ))}
      </section>

      <form className="mt-6 flex flex-wrap items-end gap-3" method="GET">
        <input type="hidden" name="season" value={String(season)} />
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Search
          <input
            name="q"
            defaultValue={q}
            placeholder="Player name or ID"
            className="mt-1 block w-48 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Team
          <select
            name="team"
            defaultValue={team}
            className="mt-1 block w-40 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            <option value="">All</option>
            {teams.rows.map((t) => (
              <option key={t.teamAbbr} value={t.teamAbbr}>
                {t.teamAbbr} · {t.teamName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Position
          <select
            name="position"
            defaultValue={position}
            className="mt-1 block w-32 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            <option value="">All</option>
            {players.facets.positions.map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Status
          <select
            name="status"
            defaultValue={status}
            className="mt-1 block w-36 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            <option value="">All</option>
            {players.facets.statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md border border-black/10 bg-black px-4 py-2 text-sm text-white hover:bg-zinc-800 dark:border-white/10 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Apply
        </button>
      </form>

      <section className="mt-8">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Last season</th>
              </tr>
            </thead>
            <tbody>
              {players.rows.map((row) => (
                <tr key={row.playerId} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2">
                    <Link className="text-black hover:underline dark:text-white" href={`/nfl/player/${row.playerId}?season=${season}`}>
                      {row.displayName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.latestTeam ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.position ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.status ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.lastSeason ?? "—"}</td>
                </tr>
              ))}
              {players.rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={5}>
                    No players match the filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
        <span>
          Page {players.page} of {totalPages} · {players.total} players
        </span>
        {page > 1 ? (
          <Link
            className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            href={`/nfl/players${buildQuery({
              season: String(season),
              q,
              team,
              position,
              status,
              page: String(page - 1),
            })}`}
          >
            Prev
          </Link>
        ) : null}
        {page < totalPages ? (
          <Link
            className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            href={`/nfl/players${buildQuery({
              season: String(season),
              q,
              team,
              position,
              status,
              page: String(page + 1),
            })}`}
          >
            Next
          </Link>
        ) : null}
      </section>
    </NflPageShell>
  );
}
