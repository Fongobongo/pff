import Link from "next/link";
import NflPageShell from "../_components/NflPageShell";
import { getSportfunMarketSnapshot, toUsdNumber } from "@/lib/sportfunMarket";

const WINDOW_OPTIONS = [24, 72, 168];
const PAGE_SIZE = 100;

function parseNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
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

function formatUsdValue(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  if (abs >= 1) return `$${value.toFixed(2)}`;
  if (abs >= 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(6)}`;
}

function normalizePosition(raw: string): string {
  const value = raw.trim().toUpperCase();
  if (value.includes("QUARTERBACK") || value === "QB") return "QB";
  if (value.includes("RUNNING BACK") || value === "RB") return "RB";
  if (value.includes("WIDE RECEIVER") || value === "WR") return "WR";
  if (value.includes("TIGHT END") || value === "TE") return "TE";
  if (value.includes("KICKER") || value === "K") return "K";
  if (value.includes("DEF") || value.includes("DST")) return "DST";
  return value;
}

function extractAttributeValue(attributes: unknown, matchKey: (key: string) => boolean): unknown {
  if (!attributes) return undefined;
  if (Array.isArray(attributes)) {
    for (const entry of attributes) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const key = String(record.trait_type ?? record.traitType ?? record.name ?? record.key ?? "").toLowerCase();
      if (!key) continue;
      if (matchKey(key)) return record.value ?? record.val ?? record.text ?? record.content;
    }
  }
  if (typeof attributes === "object") {
    for (const [key, value] of Object.entries(attributes as Record<string, unknown>)) {
      if (matchKey(key.toLowerCase())) return value;
    }
  }
  return undefined;
}

function extractPosition(attributes: unknown): string | null {
  const raw = extractAttributeValue(attributes, (key) => key.includes("position") || key === "pos");
  if (typeof raw === "string" && raw.trim()) return normalizePosition(raw);
  return null;
}

function extractTeam(attributes: unknown): string | null {
  const raw = extractAttributeValue(attributes, (key) => key.includes("team") || key.includes("club"));
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

function extractSupply(attributes: unknown): number | null {
  const raw = extractAttributeValue(
    attributes,
    (key) => key.includes("supply") || key.includes("shares") || key.includes("outstanding")
  );
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw > 1e12 ? raw / 1e18 : raw;
  if (typeof raw === "string") {
    const cleaned = raw.replace(/,/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) return null;
    return parsed > 1e12 ? parsed / 1e18 : parsed;
  }
  return null;
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

export default async function NflPricesPage({
  searchParams,
}: {
  searchParams: Promise<{
    windowHours?: string;
    position?: string;
    team?: string;
    q?: string;
    page?: string;
    sort?: string;
  }>;
}) {
  const params = await searchParams;
  const windowHours = parseNumber(params.windowHours, 24, 1, 168);
  const positionParam = params.position?.toUpperCase();
  const teamParam = params.team?.toUpperCase();
  const positionFilter = positionParam && positionParam !== "ALL" ? positionParam : undefined;
  const teamFilter = teamParam && teamParam !== "ALL" ? teamParam : undefined;
  const queryText = params.q?.trim().toLowerCase() ?? "";
  const pageParam = parseNumber(params.page, 1, 1, 200);
  const sortParam = params.sort ?? "price_desc";

  const snapshot = await getSportfunMarketSnapshot({
    sport: "nfl",
    trendDays: 30,
    windowHours,
    maxTokens: 250,
  });

  const sorted = snapshot.tokens.slice();

  const positions = Array.from(
    new Set(
      sorted
        .map((row) => row.position ?? (row.attributes ? extractPosition(row.attributes) : null))
        .filter((value): value is string => typeof value === "string" && Boolean(value))
        .map((value) => value.toUpperCase())
    )
  ).sort();

  const teams = Array.from(
    new Set(
      sorted
        .map((row) => row.team ?? (row.attributes ? extractTeam(row.attributes) : null))
        .filter((value): value is string => typeof value === "string" && Boolean(value))
        .map((value) => value.toUpperCase())
    )
  ).sort();

  const filteredBase = sorted.filter((row) => {
    const position = row.position ?? (row.attributes ? extractPosition(row.attributes) : null);
    const team = row.team ?? (row.attributes ? extractTeam(row.attributes) : null);
    if (positionFilter && (position ?? "").toUpperCase() !== positionFilter) return false;
    if (teamFilter && (team ?? "").toUpperCase() !== teamFilter) return false;
    if (queryText) {
      const label = (row.name ?? `#${row.tokenIdDec}`).toLowerCase();
      if (!label.includes(queryText)) return false;
    }
    return true;
  });

  const sortedFiltered = filteredBase.slice().sort((a, b) => {
    const aPrice = BigInt(a.currentPriceUsdcRaw ?? "0");
    const bPrice = BigInt(b.currentPriceUsdcRaw ?? "0");
    const aChange = a.priceChange24hPercent ?? 0;
    const bChange = b.priceChange24hPercent ?? 0;
    const aVolume = BigInt(a.volume24hSharesRaw ?? "0");
    const bVolume = BigInt(b.volume24hSharesRaw ?? "0");
    const aTrades = a.trades24h ?? 0;
    const bTrades = b.trades24h ?? 0;
    const aSupply = a.supply ?? (a.attributes ? extractSupply(a.attributes) : null) ?? 0;
    const bSupply = b.supply ?? (b.attributes ? extractSupply(b.attributes) : null) ?? 0;
    const aPriceNum = a.currentPriceUsdcRaw ? toUsdNumber(a.currentPriceUsdcRaw) : 0;
    const bPriceNum = b.currentPriceUsdcRaw ? toUsdNumber(b.currentPriceUsdcRaw) : 0;
    const aMarketCap = aSupply && aPriceNum ? aSupply * aPriceNum : 0;
    const bMarketCap = bSupply && bPriceNum ? bSupply * bPriceNum : 0;

    switch (sortParam) {
      case "price_asc":
        if (aPrice === bPrice) return a.tokenIdDec.localeCompare(b.tokenIdDec);
        return aPrice > bPrice ? 1 : -1;
      case "change_desc":
        return bChange - aChange;
      case "change_asc":
        return aChange - bChange;
      case "market_cap_desc":
        return bMarketCap - aMarketCap;
      case "market_cap_asc":
        return aMarketCap - bMarketCap;
      case "volume_desc":
        if (aVolume === bVolume) return 0;
        return bVolume > aVolume ? 1 : -1;
      case "trades_desc":
        return bTrades - aTrades;
      case "price_desc":
      default:
        if (aPrice === bPrice) return a.tokenIdDec.localeCompare(b.tokenIdDec);
        return bPrice > aPrice ? 1 : -1;
    }
  });

  const totalPages = Math.max(1, Math.ceil(sortedFiltered.length / PAGE_SIZE));
  const page = Math.min(totalPages, Math.max(1, pageParam));
  const rows = sortedFiltered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const buildExportCsv = () => {
    const header = [
      "tokenId",
      "player",
      "position",
      "team",
      "price_usd",
      "price_change_24h_pct",
      "volume_shares_24h",
      "trades_24h",
      "last_trade_at",
      "supply",
      "market_cap",
    ];

    const lines = [header.join(",")];
    for (const row of sortedFiltered) {
      const position = row.position ?? (row.attributes ? extractPosition(row.attributes) : null);
      const team = row.team ?? (row.attributes ? extractTeam(row.attributes) : null);
      const supply = row.supply ?? (row.attributes ? extractSupply(row.attributes) : null);
      const price = row.currentPriceUsdcRaw ? toUsdNumber(row.currentPriceUsdcRaw) : undefined;
      const marketCap = supply && price ? supply * price : undefined;
      lines.push(
        [
          row.tokenIdDec,
          `"${String(row.name ?? `#${row.tokenIdDec}`).replaceAll('"', '""')}"`,
          position ?? "",
          team ?? "",
          price ?? "",
          row.priceChange24hPercent ?? "",
          row.volume24hSharesRaw ?? "0",
          row.trades24h ?? 0,
          row.lastTradeAt ?? "",
          supply ?? "",
          marketCap ?? "",
        ].join(",")
      );
    }

    return lines.join("\n");
  };

  const exportCsvHref = () => {
    const csv = buildExportCsv();
    const data = encodeURIComponent(csv);
    return `data:text/csv;charset=utf-8,${data}`;
  };

  return (
    <NflPageShell title="NFL prices" description="Full price tape with filters and pagination.">
      <section className="mt-6 flex flex-wrap gap-3">
        {WINDOW_OPTIONS.map((hours) => (
          <Link
            key={hours}
            className={`rounded-full border px-3 py-2 text-xs ${
              hours === windowHours
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/prices${buildQuery({
              windowHours: String(hours),
              position: positionFilter ?? undefined,
              team: teamFilter ?? undefined,
              q: queryText || undefined,
            })}`}
          >
            {hours}h window
          </Link>
        ))}
      </section>

      <section className="mt-4 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <input type="hidden" name="windowHours" value={String(windowHours)} />
          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            <span>Search</span>
            <input
              name="q"
              defaultValue={queryText}
              placeholder="Player name"
              className="min-w-[160px] rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
          </label>
          <div className="flex items-center gap-2">
                {["QB", "RB", "WR", "TE", "K", "DST"].map((pos) => (
                  <Link
                    key={pos}
                    className={`rounded-full border px-3 py-1 text-[11px] uppercase ${
                      positionFilter === pos
                        ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                        : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                    }`}
                    href={`/nfl/prices${buildQuery({
                      windowHours: String(windowHours),
                      position: pos,
                      team: teamFilter ?? undefined,
                      q: queryText || undefined,
                      sort: sortParam,
                    })}`}
                  >
                    {pos}
                  </Link>
                ))}
          </div>
          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            <span>Position</span>
            <select
              name="position"
              defaultValue={positionFilter ?? "all"}
              className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
            >
              <option value="all">All</option>
              {positions.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            <span>Team</span>
            <select
              name="team"
              defaultValue={teamFilter ?? "all"}
              className="min-w-[140px] rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
            >
              <option value="all">All</option>
              {teams.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            <span>Sort</span>
            <select
              name="sort"
              defaultValue={sortParam}
              className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
            >
              <option value="price_desc">Price ↓</option>
              <option value="price_asc">Price ↑</option>
              <option value="market_cap_desc">Market cap ↓</option>
              <option value="market_cap_asc">Market cap ↑</option>
              <option value="change_desc">Δ 24h ↓</option>
              <option value="change_asc">Δ 24h ↑</option>
              <option value="volume_desc">Volume ↓</option>
              <option value="trades_desc">Trades ↓</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md border border-black/10 bg-black px-3 py-1 text-xs text-white hover:bg-zinc-800 dark:border-white/10 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Apply
          </button>
          <Link
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            href={`/nfl/prices${buildQuery({ windowHours: String(windowHours) })}`}
          >
            Reset
          </Link>
          <a
            href={exportCsvHref()}
            download={`nfl-prices-${windowHours}h.csv`}
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          >
            Export CSV
          </a>
            <div className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">
              {sortedFiltered.length} tokens · page {page} / {totalPages}
            </div>
          </form>
      </section>

      <section className="mt-6">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="max-h-[720px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-black dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Pos</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Market cap</th>
                  <th className="px-3 py-2">Δ (24h)</th>
                  <th className="px-3 py-2">Volume</th>
                  <th className="px-3 py-2">Trades</th>
                  <th className="px-3 py-2">Last trade</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const position = row.position ?? (row.attributes ? extractPosition(row.attributes) : null);
                  const team = row.team ?? (row.attributes ? extractTeam(row.attributes) : null);
                  const supply = row.supply ?? (row.attributes ? extractSupply(row.attributes) : null);
                  const price = row.currentPriceUsdcRaw ? toUsdNumber(row.currentPriceUsdcRaw) : undefined;
                  const marketCap = supply && price ? supply * price : undefined;
                  return (
                    <tr key={row.tokenIdDec} className="border-t border-black/10 dark:border-white/10">
                      <td className="px-3 py-2 text-black dark:text-white">{row.name ?? `#${row.tokenIdDec}`}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{position ?? "—"}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{team ?? "—"}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatUsd(row.currentPriceUsdcRaw)}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                        {marketCap !== undefined ? formatUsdValue(marketCap) : "—"}
                      </td>
                      <td
                        className={`px-3 py-2 ${
                          (row.priceChange24hPercent ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"
                        }`}
                      >
                        {formatPercent(row.priceChange24hPercent)}
                      </td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                        {formatShares(row.volume24hSharesRaw, 2)}
                      </td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.trades24h ?? 0}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                        {row.lastTradeAt ? formatDate(row.lastTradeAt) : "—"}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={9}>
                      No tokens match the filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-black/10 px-3 py-2 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-400">
            <Link
              href={`/nfl/prices${buildQuery({
                windowHours: String(windowHours),
                position: positionFilter ?? undefined,
                team: teamFilter ?? undefined,
                q: queryText || undefined,
                sort: sortParam,
                page: String(Math.max(1, page - 1)),
              })}`}
              className={page > 1 ? "hover:underline" : "pointer-events-none opacity-40"}
            >
              Prev
            </Link>
            <span>
              Page {page} of {totalPages}
            </span>
            <Link
              href={`/nfl/prices${buildQuery({
                windowHours: String(windowHours),
                position: positionFilter ?? undefined,
                team: teamFilter ?? undefined,
                q: queryText || undefined,
                sort: sortParam,
                page: String(Math.min(totalPages, page + 1)),
              })}`}
              className={page < totalPages ? "hover:underline" : "pointer-events-none opacity-40"}
            >
              Next
            </Link>
          </div>
        </div>
      </section>
    </NflPageShell>
  );
}
