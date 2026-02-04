import Link from "next/link";
import SoccerPageShell from "../_components/SoccerPageShell";
import { getSportfunMarketSnapshot, toUsdNumber } from "@/lib/sportfunMarket";
import { SOCCER_COMPETITIONS, fetchSoccerCompetitionScores } from "@/lib/soccerStats";

const SORT_OPTIONS = [
  { key: "volume", label: "24h volume" },
  { key: "change", label: "24h price change" },
  { key: "trades", label: "24h trades" },
] as const;

const FORM_SORT_OPTIONS = [
  { key: "l3_fpts", label: "L3 FPts" },
  { key: "form_delta", label: "Form Δ" },
  { key: "l3_xg", label: "L3 xG" },
  { key: "l3_xa", label: "L3 xA" },
  { key: "l3_xgxa", label: "L3 xG+xA" },
  { key: "l3_goals", label: "L3 Goals" },
  { key: "l3_assists", label: "L3 Assists" },
  { key: "l3_minutes", label: "L3 Minutes" },
  { key: "l3_shots", label: "L3 SOT" },
  { key: "l3_chances", label: "L3 Chances" },
] as const;

const LIMIT_OPTIONS = [20, 50, 100, 200, 380];

function parseNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function toNumber(value: number | undefined): number {
  return Number(value ?? 0) || 0;
}

function formatUsd(raw?: string): string {
  if (!raw) return "—";
  const value = toUsdNumber(raw);
  const abs = Math.abs(value);
  if (abs >= 1000) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (abs >= 1) return `$${value.toFixed(2)}`;
  if (abs >= 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(6)}`;
}

function formatPercent(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatNumber(value?: number, decimals = 2): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(decimals);
}

function formatDelta(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function formatShares(raw?: string, fractionDigits = 2): string {
  if (!raw) return "0";
  const neg = raw.startsWith("-");
  const abs = BigInt(neg ? raw.slice(1) : raw);
  const base = 10n ** 18n;
  const whole = abs / base;
  const fraction = abs % base;
  if (fractionDigits <= 0) return `${neg ? "-" : ""}${whole.toString()}`;
  const frac = fraction.toString().padStart(18, "0").slice(0, fractionDigits);
  return `${neg ? "-" : ""}${whole.toString()}.${frac}`;
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((acc, val) => acc + val, 0) / values.length;
}

function buildQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

type FormAppearance = {
  score: number;
  goals: number;
  assists: number;
  xg: number;
  xa: number;
  minutes: number;
  shotsOnTarget: number;
  chances: number;
};

type FormRow = {
  playerId: number;
  name: string;
  team?: string;
  position?: string;
  games: number;
  l3Fpts: number;
  l3Goals: number;
  l3Assists: number;
  l3Xg: number;
  l3Xa: number;
  l3XgXa: number;
  l3Minutes: number;
  l3Shots: number;
  l3Chances: number;
  formDelta?: number;
};

export default async function SoccerTrendingPage({
  searchParams,
}: {
  searchParams: Promise<{
    sort?: string;
    windowHours?: string;
    competition?: string;
    season?: string;
    limit?: string;
    position?: string;
    form_sort?: string;
    min_minutes?: string;
    q?: string;
  }>;
}) {
  const params = await searchParams;
  const windowHours = parseNumber(params.windowHours, 24, 1, 168);
  const sort = SORT_OPTIONS.find((opt) => opt.key === params.sort)?.key ?? "volume";
  const competitionId = Number(params.competition ?? SOCCER_COMPETITIONS[0].id);
  const seasonId = Number(params.season ?? SOCCER_COMPETITIONS[0].seasonId);
  const limit = parseNumber(params.limit, 50, 4, 400);
  const positionFilter = params.position?.toUpperCase();
  const formSort = FORM_SORT_OPTIONS.find((opt) => opt.key === params.form_sort)?.key ?? "l3_fpts";
  const minMinutes = parseNumber(params.min_minutes, 0, 0, 270);
  const queryText = params.q?.trim().toLowerCase() ?? "";

  const [snapshot, formData] = await Promise.all([
    getSportfunMarketSnapshot({
      sport: "soccer",
      windowHours,
      trendDays: 30,
      maxTokens: 200,
    }),
    fetchSoccerCompetitionScores({
      competitionId,
      seasonId,
      limit,
      recent: true,
    }),
  ]);

  const sortedTokens = snapshot.tokens.slice().sort((a, b) => {
    if (sort === "change") return Math.abs(b.priceChange24hPercent ?? 0) - Math.abs(a.priceChange24hPercent ?? 0);
    if (sort === "trades") return (b.trades24h ?? 0) - (a.trades24h ?? 0);
    return Number(b.volume24hSharesRaw ?? 0) - Number(a.volume24hSharesRaw ?? 0);
  });

  const formMap = new Map<
    number,
    { playerId: number; name: string; team?: string; position?: string; appearances: FormAppearance[] }
  >();

  for (const match of formData.matches ?? []) {
    for (const player of match.players ?? []) {
      const score = player.score?.totalRounded ?? player.score?.total ?? 0;
      const entry = formMap.get(player.playerId) ?? {
        playerId: player.playerId,
        name: player.playerName,
        team: player.teamName,
        position: player.position,
        appearances: [],
      };
      entry.appearances.push({
        score,
        goals: toNumber(player.stats?.goals),
        assists: toNumber(player.stats?.assists),
        xg: toNumber(player.xg),
        xa: toNumber(player.xa),
        minutes: toNumber(player.minutesPlayed),
        shotsOnTarget: toNumber(player.stats?.shots_on_target),
        chances: toNumber(player.stats?.big_chances_created),
      });
      formMap.set(player.playerId, entry);
    }
  }

  const formRows: FormRow[] = Array.from(formMap.values()).map((entry) => {
    const ordered = entry.appearances;
    const last3 = ordered.slice(-3);
    const prev3 = ordered.slice(-6, -3);
    const l3Fpts = average(last3.map((row) => row.score));
    const l3Goals = average(last3.map((row) => row.goals));
    const l3Assists = average(last3.map((row) => row.assists));
    const l3Xg = average(last3.map((row) => row.xg));
    const l3Xa = average(last3.map((row) => row.xa));
    const l3Minutes = average(last3.map((row) => row.minutes));
    const l3Shots = average(last3.map((row) => row.shotsOnTarget));
    const l3Chances = average(last3.map((row) => row.chances));
    const prevFpts = average(prev3.map((row) => row.score));
    const formDelta = prev3.length ? l3Fpts - prevFpts : undefined;

    return {
      playerId: entry.playerId,
      name: entry.name,
      team: entry.team,
      position: entry.position,
      games: ordered.length,
      l3Fpts,
      l3Goals,
      l3Assists,
      l3Xg,
      l3Xa,
      l3XgXa: l3Xg + l3Xa,
      l3Minutes,
      l3Shots,
      l3Chances,
      formDelta,
    };
  });

  const positions = Array.from(
    new Set(formRows.map((row) => row.position).filter((value): value is string => Boolean(value)))
  ).sort();

  let filteredForm = formRows;

  if (positionFilter) {
    filteredForm = filteredForm.filter((row) => (row.position ?? "").toUpperCase() === positionFilter);
  }

  if (queryText) {
    filteredForm = filteredForm.filter((row) => row.name.toLowerCase().includes(queryText));
  }

  if (minMinutes > 0) {
    filteredForm = filteredForm.filter((row) => row.l3Minutes >= minMinutes);
  }

  const formSorted = filteredForm.slice().sort((a, b) => {
    switch (formSort) {
      case "form_delta":
        return (b.formDelta ?? -Infinity) - (a.formDelta ?? -Infinity);
      case "l3_xg":
        return b.l3Xg - a.l3Xg;
      case "l3_xa":
        return b.l3Xa - a.l3Xa;
      case "l3_xgxa":
        return b.l3XgXa - a.l3XgXa;
      case "l3_goals":
        return b.l3Goals - a.l3Goals;
      case "l3_assists":
        return b.l3Assists - a.l3Assists;
      case "l3_minutes":
        return b.l3Minutes - a.l3Minutes;
      case "l3_shots":
        return b.l3Shots - a.l3Shots;
      case "l3_chances":
        return b.l3Chances - a.l3Chances;
      case "l3_fpts":
      default:
        return b.l3Fpts - a.l3Fpts;
    }
  });

  const currentCompetition = SOCCER_COMPETITIONS.find(
    (item) => item.id === competitionId && item.seasonId === seasonId
  );

  const sharedParams = {
    competition: String(competitionId),
    season: String(seasonId),
    limit: String(limit),
    position: positionFilter,
    form_sort: formSort,
    min_minutes: minMinutes > 0 ? String(minMinutes) : undefined,
    q: params.q,
  };

  const marketParams = {
    windowHours: String(windowHours),
    sort,
  };

  return (
    <SoccerPageShell
      title="Soccer trending players"
      description="Trending Sport.fun soccer tokens based on 24h on-chain activity."
    >
      <section className="mt-6 flex flex-wrap gap-3">
        {[6, 12, 24, 48, 72].map((hours) => (
          <Link
            key={hours}
            className={`rounded-full border px-3 py-2 text-xs ${
              hours === windowHours
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/soccer/trending${buildQuery({ windowHours: String(hours), sort, ...sharedParams })}`}
          >
            {hours}h window
          </Link>
        ))}
      </section>

      <section className="mt-4 flex flex-wrap gap-3">
        {SORT_OPTIONS.map((opt) => (
          <Link
            key={opt.key}
            className={`rounded-full border px-3 py-2 text-xs ${
              opt.key === sort
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/soccer/trending${buildQuery({ windowHours: String(windowHours), sort: opt.key, ...sharedParams })}`}
          >
            {opt.label}
          </Link>
        ))}
      </section>

      <section className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        <p>Sorting by {SORT_OPTIONS.find((opt) => opt.key === sort)?.label}. Snapshot updated {formatDate(snapshot.asOf)}.</p>
      </section>

      <section className="mt-8">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Δ</th>
                <th className="px-3 py-2">Volume</th>
                <th className="px-3 py-2">Trades</th>
                <th className="px-3 py-2">Last trade</th>
              </tr>
            </thead>
            <tbody>
              {sortedTokens.slice(0, 50).map((row) => (
                <tr key={row.tokenIdDec} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.name ?? `#${row.tokenIdDec}`}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatUsd(row.currentPriceUsdcRaw)}</td>
                  <td
                    className={`px-3 py-2 ${
                      (row.priceChange24hPercent ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"
                    }`}
                  >
                    {formatPercent(row.priceChange24hPercent)}
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatShares(row.volume24hSharesRaw, 2)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.trades24h}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatDate(row.lastTradeAt)}</td>
                </tr>
              ))}
              {sortedTokens.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={6}>
                    No trades found for the selected window.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">On-pitch form</div>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Showing {limit} recent matches · {currentCompetition?.label ?? "Competition"}. L3 metrics are per-game averages.
        </p>
      </section>

      <section className="mt-4 flex flex-wrap gap-3">
        {SOCCER_COMPETITIONS.map((comp) => (
          <Link
            key={`${comp.id}-${comp.seasonId}`}
            className={`rounded-full border px-3 py-2 text-xs ${
              comp.id === competitionId && comp.seasonId === seasonId
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/soccer/trending${buildQuery({
              ...marketParams,
              competition: String(comp.id),
              season: String(comp.seasonId),
              limit: String(limit),
              position: positionFilter,
              form_sort: formSort,
              min_minutes: minMinutes > 0 ? String(minMinutes) : undefined,
              q: params.q,
            })}`}
          >
            {comp.label}
          </Link>
        ))}
      </section>

      <section className="mt-4 flex flex-wrap gap-2">
        {LIMIT_OPTIONS.map((value) => (
          <Link
            key={value}
            className={`rounded-full border px-3 py-1 text-xs ${
              value === limit
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/soccer/trending${buildQuery({
              ...marketParams,
              competition: String(competitionId),
              season: String(seasonId),
              limit: String(value),
              position: positionFilter,
              form_sort: formSort,
              min_minutes: minMinutes > 0 ? String(minMinutes) : undefined,
              q: params.q,
            })}`}
          >
            {value} matches
          </Link>
        ))}
      </section>

      <form className="mt-6 flex flex-wrap items-end gap-3" method="GET">
        <input type="hidden" name="windowHours" value={windowHours} />
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="competition" value={competitionId} />
        <input type="hidden" name="season" value={seasonId} />
        <input type="hidden" name="limit" value={limit} />
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Search
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Player name"
            className="mt-1 block w-48 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Position
          <select
            name="position"
            defaultValue={positionFilter ?? ""}
            className="mt-1 block w-24 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            <option value="">All</option>
            {positions.map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Min minutes
          <input
            type="number"
            name="min_minutes"
            min={0}
            max={270}
            step={5}
            defaultValue={minMinutes || ""}
            className="mt-1 block w-24 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Sort
          <select
            name="form_sort"
            defaultValue={formSort}
            className="mt-1 block w-36 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            {FORM_SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
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

      <section className="mt-6">
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <table className="w-full min-w-[1600px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2">Games</th>
                <th className="px-3 py-2">L3 FPts</th>
                <th className="px-3 py-2">Form Δ</th>
                <th className="px-3 py-2">L3 xG</th>
                <th className="px-3 py-2">L3 xA</th>
                <th className="px-3 py-2">L3 xG+xA</th>
                <th className="px-3 py-2">L3 Goals</th>
                <th className="px-3 py-2">L3 Assists</th>
                <th className="px-3 py-2">L3 SOT</th>
                <th className="px-3 py-2">L3 Chances</th>
                <th className="px-3 py-2">L3 Minutes</th>
              </tr>
            </thead>
            <tbody>
              {formSorted.slice(0, 75).map((row) => (
                <tr key={row.playerId} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.name}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.position ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.games}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatNumber(row.l3Fpts)}</td>
                  <td
                    className={`px-3 py-2 ${(row.formDelta ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"}`}
                  >
                    {formatDelta(row.formDelta)}
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatNumber(row.l3Xg)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatNumber(row.l3Xa)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatNumber(row.l3XgXa)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatNumber(row.l3Goals)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatNumber(row.l3Assists)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatNumber(row.l3Shots)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatNumber(row.l3Chances)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatNumber(row.l3Minutes, 0)}</td>
                </tr>
              ))}
              {formSorted.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={14}>
                    No form data matches the filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          How to use this page: trending is based on on-chain Sport.fun trades, while form trends show recent on-pitch
          production. Higher volume + improving form often signals momentum.
        </p>
      </section>
    </SoccerPageShell>
  );
}
