import Link from "next/link";
import SportsfunPageShell from "../_components/SportsfunPageShell";
import { formatCompactNumber, formatPercent, formatUsd } from "../_components/format";
import { getSportsfunTokens } from "@/lib/teneroSportsfun";

const TIMEFRAME_OPTIONS = ["1h", "4h", "1d", "7d"] as const;
const LIMIT_OPTIONS = [25, 50, 100] as const;

const ORDER_OPTIONS = [
  { value: "price_usd", label: "Price" },
  { value: "marketcap_usd", label: "Mcap" },
  { value: "holder_count", label: "Holders" },
  { value: "pool_count", label: "Pools" },
  { value: "total_liquidity_usd", label: "Liquidity" },
  { value: "volume", label: "Volume (timeframe)" },
] as const;

function parseIntParam(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseTimeframe(value: string | undefined): (typeof TIMEFRAME_OPTIONS)[number] {
  if (value === "1h" || value === "4h" || value === "1d" || value === "7d") return value;
  return "1d";
}

function volumeMetricKey(timeframe: (typeof TIMEFRAME_OPTIONS)[number]) {
  if (timeframe === "1h") return "volume_1h_usd";
  if (timeframe === "4h") return "volume_4h_usd";
  if (timeframe === "7d") return "volume_7d_usd";
  return "volume_1d_usd";
}

function swapsMetricKey(timeframe: (typeof TIMEFRAME_OPTIONS)[number]) {
  if (timeframe === "1h") return "swaps_1h";
  if (timeframe === "4h") return "swaps_4h";
  if (timeframe === "7d") return "swaps_7d";
  return "swaps_1d";
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

export default async function SportsfunTokensPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;

  const q = String(Array.isArray(query.q) ? query.q[0] ?? "" : query.q ?? "").trim();
  const rawOrder = String(Array.isArray(query.order) ? query.order[0] ?? "volume" : query.order ?? "volume");
  const direction =
    String(Array.isArray(query.direction) ? query.direction[0] ?? "DESC" : query.direction ?? "DESC").toUpperCase() ===
    "ASC"
      ? "ASC"
      : "DESC";
  const timeframe = parseTimeframe(String(Array.isArray(query.timeframe) ? query.timeframe[0] : query.timeframe));
  const limit = parseIntParam(String(Array.isArray(query.limit) ? query.limit[0] : query.limit), 50, 1, 100);
  const minMcap = parseIntParam(String(Array.isArray(query.minMcap) ? query.minMcap[0] : query.minMcap), 0, 0, 1e12);
  const cursor = String(Array.isArray(query.cursor) ? query.cursor[0] ?? "" : query.cursor ?? "").trim() || undefined;

  const selectedOrder =
    rawOrder === "price_usd" ||
    rawOrder === "marketcap_usd" ||
    rawOrder === "holder_count" ||
    rawOrder === "pool_count" ||
    rawOrder === "total_liquidity_usd" ||
    rawOrder === "volume"
      ? rawOrder
      : "volume";

  const volumeOrder = volumeMetricKey(timeframe);
  const orderField = selectedOrder === "volume" ? volumeOrder : selectedOrder;

  const volumeKey = volumeMetricKey(timeframe);
  const swapsKey = swapsMetricKey(timeframe);

  let loadError: string | null = null;
  let rows: Awaited<ReturnType<typeof getSportsfunTokens>>["rows"] = [];
  let nextCursor: string | null = null;

  try {
    const page = await getSportsfunTokens({
      limit,
      cursor,
      search: q || undefined,
      order: orderField,
      direction,
      min_marketcap_usd: minMcap > 0 ? minMcap : undefined,
    });
    rows = page.rows;
    nextCursor = page.next;
  } catch (error: unknown) {
    loadError = describeError(error);
  }

  const queryWithoutCursor = new URLSearchParams();
  queryWithoutCursor.set("timeframe", timeframe);
  queryWithoutCursor.set("order", selectedOrder);
  queryWithoutCursor.set("direction", direction);
  queryWithoutCursor.set("limit", String(limit));
  if (q) queryWithoutCursor.set("q", q);
  if (minMcap > 0) queryWithoutCursor.set("minMcap", String(minMcap));

  return (
    <SportsfunPageShell
      title="sports.fun Tokens"
      description="Token screener with sorting, filtering and timeframe-aware market columns."
    >
      <section className="mt-6 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
        <form className="grid grid-cols-1 gap-3 md:grid-cols-6" method="get">
          <input
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-black dark:text-white"
            type="search"
            name="q"
            placeholder="Search symbol / name / address"
            defaultValue={q}
          />
          <select
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-black dark:text-white"
            name="order"
            defaultValue={selectedOrder}
          >
            {ORDER_OPTIONS.map((option) => (
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
            name="minMcap"
            defaultValue={minMcap > 0 ? minMcap : ""}
            placeholder="Min mcap USD"
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
          Failed to load tokens: {loadError}
        </section>
      ) : null}

      <section className="mt-6 overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">Token</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Mcap</th>
              <th className="px-3 py-2 text-right">Holders</th>
              <th className="px-3 py-2 text-right">Pools</th>
              <th className="px-3 py-2 text-right">Txs ({timeframe})</th>
              <th className="px-3 py-2 text-right">Volume ({timeframe})</th>
              <th className="px-3 py-2 text-right">24h Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const txs = Number(row.metrics?.[swapsKey] ?? 0);
              const volume = Number(row.metrics?.[volumeKey] ?? 0);
              const priceDelta = row.price?.price_change_1d_pct;
              return (
                <tr key={row.address} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2">
                    <div className="font-medium text-black dark:text-white">{row.name}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">{row.symbol}</div>
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatUsd(row.price_usd, 6)}</td>
                  <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatUsd(row.marketcap_usd)}</td>
                  <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">
                    {formatCompactNumber(row.holder_count)}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatCompactNumber(row.pool_count)}</td>
                  <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatCompactNumber(txs)}</td>
                  <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatUsd(volume)}</td>
                  <td
                    className={`px-3 py-2 text-right ${
                      (priceDelta ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"
                    }`}
                  >
                    {formatPercent(priceDelta)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-zinc-500 dark:text-zinc-400" colSpan={8}>
                  No token rows for selected filters.
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
            href={`/sportsfun/tokens?${queryWithoutCursor.toString()}&cursor=${encodeURIComponent(nextCursor)}`}
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
