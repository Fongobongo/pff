import Link from "next/link";
import SportsfunPageShell from "../_components/SportsfunPageShell";
import { formatCompactNumber, formatPercent, formatUsd } from "../_components/format";
import { getSportsfunPools } from "@/lib/teneroSportsfun";

const TIMEFRAME_OPTIONS = ["30m", "1h", "4h", "1d", "7d"] as const;
const LIMIT_OPTIONS = [25, 50, 100] as const;
const SORT_OPTIONS = [
  { value: "liquidity", label: "Liquidity" },
  { value: "marketcap", label: "Mcap" },
  { value: "volume", label: "Volume (timeframe)" },
  { value: "swaps", label: "Txs (timeframe)" },
  { value: "price_change_1d_pct", label: "24h change" },
] as const;

function parseIntParam(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseTimeframe(value: string | undefined): (typeof TIMEFRAME_OPTIONS)[number] {
  if (value === "30m" || value === "1h" || value === "4h" || value === "1d" || value === "7d") return value;
  return "1d";
}

function volumeMetricKey(timeframe: (typeof TIMEFRAME_OPTIONS)[number]) {
  if (timeframe === "30m") return "volume_30m_usd";
  if (timeframe === "1h") return "volume_1h_usd";
  if (timeframe === "4h") return "volume_4h_usd";
  if (timeframe === "7d") return "volume_7d_usd";
  return "volume_1d_usd";
}

function swapsMetricKey(timeframe: (typeof TIMEFRAME_OPTIONS)[number]) {
  if (timeframe === "30m") return "swaps_30m";
  if (timeframe === "1h") return "swaps_1h";
  if (timeframe === "4h") return "swaps_4h";
  if (timeframe === "7d") return "swaps_7d";
  return "swaps_1d";
}

function parseSort(value: string | undefined): (typeof SORT_OPTIONS)[number]["value"] {
  if (
    value === "liquidity" ||
    value === "marketcap" ||
    value === "volume" ||
    value === "swaps" ||
    value === "price_change_1d_pct"
  ) {
    return value;
  }
  return "volume";
}

function resolveOrderField(sort: (typeof SORT_OPTIONS)[number]["value"], timeframe: (typeof TIMEFRAME_OPTIONS)[number]) {
  if (sort === "liquidity") return "liquidity_usd";
  if (sort === "marketcap") return "marketcap_usd";
  if (sort === "swaps") return swapsMetricKey(timeframe);
  if (sort === "price_change_1d_pct") return "price_change_1d_pct";
  return volumeMetricKey(timeframe);
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

export default async function SportsfunPoolsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const q = String(Array.isArray(query.q) ? query.q[0] ?? "" : query.q ?? "").trim();
  const timeframe = parseTimeframe(String(Array.isArray(query.timeframe) ? query.timeframe[0] : query.timeframe));
  const sort = parseSort(String(Array.isArray(query.sort) ? query.sort[0] : query.sort));
  const direction =
    String(Array.isArray(query.direction) ? query.direction[0] ?? "DESC" : query.direction ?? "DESC").toUpperCase() ===
    "ASC"
      ? "ASC"
      : "DESC";
  const limit = parseIntParam(String(Array.isArray(query.limit) ? query.limit[0] : query.limit), 50, 1, 100);
  const minLiquidity = parseIntParam(
    String(Array.isArray(query.minLiquidity) ? query.minLiquidity[0] : query.minLiquidity),
    0,
    0,
    1e12
  );
  const cursor = String(Array.isArray(query.cursor) ? query.cursor[0] ?? "" : query.cursor ?? "").trim() || undefined;
  const orderField = resolveOrderField(sort, timeframe);
  const volumeKey = volumeMetricKey(timeframe);
  const swapsKey = swapsMetricKey(timeframe);

  let loadError: string | null = null;
  let rows: Awaited<ReturnType<typeof getSportsfunPools>>["rows"] = [];
  let nextCursor: string | null = null;

  try {
    const page = await getSportsfunPools({
      limit,
      cursor,
      order: orderField,
      direction,
      search: q || undefined,
      min_liquidity_usd: minLiquidity > 0 ? minLiquidity : undefined,
    });
    rows = page.rows;
    nextCursor = page.next;
  } catch (error: unknown) {
    loadError = describeError(error);
  }

  const queryWithoutCursor = new URLSearchParams();
  queryWithoutCursor.set("timeframe", timeframe);
  queryWithoutCursor.set("sort", sort);
  queryWithoutCursor.set("direction", direction);
  queryWithoutCursor.set("limit", String(limit));
  if (q) queryWithoutCursor.set("q", q);
  if (minLiquidity > 0) queryWithoutCursor.set("minLiquidity", String(minLiquidity));

  return (
    <SportsfunPageShell
      title="sports.fun Pools"
      description="Pool screener with liquidity, holder and transaction metrics."
    >
      <section className="mt-6 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
        <form className="grid grid-cols-1 gap-3 md:grid-cols-6" method="get">
          <input
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-black dark:text-white"
            type="search"
            name="q"
            placeholder="Search token / pool id"
            defaultValue={q}
          />
          <select
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-black dark:text-white"
            name="sort"
            defaultValue={sort}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-black dark:text-white"
            name="direction"
            defaultValue={direction}
          >
            <option value="DESC">DESC</option>
            <option value="ASC">ASC</option>
          </select>
          <select
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-black dark:text-white"
            name="timeframe"
            defaultValue={timeframe}
          >
            {TIMEFRAME_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-black dark:text-white"
            name="limit"
            defaultValue={limit}
          >
            {LIMIT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <input
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-black dark:text-white"
            type="number"
            min={0}
            name="minLiquidity"
            defaultValue={minLiquidity > 0 ? minLiquidity : ""}
            placeholder="Min liquidity USD"
          />
          <div className="md:col-span-6">
            <button
              type="submit"
              className="rounded-lg border border-black bg-black px-4 py-2 text-sm text-white hover:bg-zinc-800 dark:border-white dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Apply filters
            </button>
          </div>
        </form>
      </section>

      {loadError ? (
        <section className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          Failed to load pools: {loadError}
        </section>
      ) : null}

      <section className="mt-6 overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
        <table className="w-full min-w-[1040px] text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">Pool</th>
              <th className="px-3 py-2 text-right">Liquidity</th>
              <th className="px-3 py-2 text-right">Mcap</th>
              <th className="px-3 py-2 text-right">Holders</th>
              <th className="px-3 py-2 text-right">Txs ({timeframe})</th>
              <th className="px-3 py-2 text-right">Volume ({timeframe})</th>
              <th className="px-3 py-2 text-right">24h Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const swaps = Number(row.metrics?.[swapsKey] ?? 0);
              const volume = Number(row.metrics?.[volumeKey] ?? 0);
              const change = row.price?.price_change_1d_pct;
              return (
                <tr key={row.pool_id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2">
                    <div className="font-medium text-black dark:text-white">
                      {row.base_token?.symbol}/{row.quote_token?.symbol}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">{row.base_token?.name}</div>
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatUsd(row.liquidity_usd)}</td>
                  <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatUsd(row.marketcap_usd)}</td>
                  <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">
                    {formatCompactNumber(row.base_token?.holder_count ?? 0)}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatCompactNumber(swaps)}</td>
                  <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatUsd(volume)}</td>
                  <td
                    className={`px-3 py-2 text-right ${
                      (change ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"
                    }`}
                  >
                    {formatPercent(change)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-zinc-500 dark:text-zinc-400" colSpan={7}>
                  No pool rows for selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="mt-4 flex items-center justify-between text-sm">
        <div className="text-zinc-500 dark:text-zinc-400">Loaded rows: {rows.length}</div>
        {nextCursor ? (
          <Link
            href={`/sportsfun/pools?${queryWithoutCursor.toString()}&cursor=${encodeURIComponent(nextCursor)}`}
            className="rounded-md border border-black/10 bg-white px-3 py-1 text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
          >
            Next page
          </Link>
        ) : (
          <span className="text-zinc-500 dark:text-zinc-500">No next cursor</span>
        )}
      </section>
    </SportsfunPageShell>
  );
}
