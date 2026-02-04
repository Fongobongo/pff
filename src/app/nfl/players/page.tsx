import Link from "next/link";
import NflPageShell from "../_components/NflPageShell";
import { getSportfunMarketSnapshot, toUsdNumber } from "@/lib/sportfunMarket";

const PAGE_SIZE = 50;
const SORT_OPTIONS = [
  { key: "price", label: "Price" },
  { key: "change", label: "24h Change" },
  { key: "volume", label: "24h Volume" },
  { key: "trades", label: "24h Trades" },
] as const;

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
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim().toLowerCase() ?? "";
  const sort = SORT_OPTIONS.find((opt) => opt.key === params.sort)?.key ?? "price";
  const page = parseNumber(params.page, 1, 1, 9999);

  const snapshot = await getSportfunMarketSnapshot({
    sport: "nfl",
    windowHours: 24,
    trendDays: 30,
    maxTokens: 500,
  });

  const filtered = snapshot.tokens.filter((token) => {
    if (!q) return true;
    const name = token.name?.toLowerCase() ?? "";
    return name.includes(q) || token.tokenIdDec.includes(q);
  });

  const sorted = filtered.slice().sort((a, b) => {
    if (sort === "change") return (b.priceChange24hPercent ?? 0) - (a.priceChange24hPercent ?? 0);
    if (sort === "volume") return Number(b.volume24hSharesRaw ?? 0) - Number(a.volume24hSharesRaw ?? 0);
    if (sort === "trades") return (b.trades24h ?? 0) - (a.trades24h ?? 0);
    return Number(b.currentPriceUsdcRaw ?? 0) - Number(a.currentPriceUsdcRaw ?? 0);
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <NflPageShell title="NFL players" description="Sport.fun player token directory and pricing.">
      <form className="mt-6 flex flex-wrap items-end gap-3" method="GET">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Search
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Player name or token ID"
            className="mt-1 block w-56 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Sort
          <select
            name="sort"
            defaultValue={sort}
            className="mt-1 block w-44 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            {SORT_OPTIONS.map((opt) => (
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

      <section className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Showing {pageRows.length} of {filtered.length} tokens · page {safePage} / {totalPages}.
        </p>
      </section>

      <section className="mt-8">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Token ID</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Δ (24h)</th>
                <th className="px-3 py-2">Volume</th>
                <th className="px-3 py-2">Trades</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={row.tokenIdDec} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.name ?? `#${row.tokenIdDec}`}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.tokenIdDec}</td>
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
                </tr>
              ))}
              {pageRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={6}>
                    No players match the filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 flex flex-wrap gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        {Array.from({ length: totalPages }, (_, idx) => idx + 1).slice(0, 8).map((p) => (
          <Link
            key={p}
            className={p === safePage ? "text-black dark:text-white" : "hover:underline"}
            href={`/nfl/players${buildQuery({ q: params.q, sort, page: String(p) })}`}
          >
            {p}
          </Link>
        ))}
        {totalPages > 8 ? <span>…</span> : null}
      </section>
    </NflPageShell>
  );
}
