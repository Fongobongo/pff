import Link from "next/link";
import { shortenAddress } from "@/lib/format";
import {
  isSportfunPriceStoreConfigured,
  listStoredSportfunPrices,
  type SportfunPriceListRow,
} from "@/lib/sportfunPrices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZES = [100, 200, 500, 1000] as const;
const USDC_DECIMALS = 6n;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function formatUsdc(raw: string): string {
  try {
    const base = 10n ** USDC_DECIMALS;
    const value = BigInt(raw);
    const neg = value < 0n;
    const abs = neg ? -value : value;
    const whole = abs / base;
    const frac = (abs % base).toString().padStart(Number(USDC_DECIMALS), "0");
    const fracTrimmed = frac.replace(/0+$/, "");
    return `${neg ? "-" : ""}${whole.toLocaleString("en-US")}${fracTrimmed ? `.${fracTrimmed}` : ""}`;
  } catch {
    return raw;
  }
}

function formatTs(raw?: string): string {
  if (!raw) return "—";
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return raw;
  return new Date(ts).toISOString();
}

function latestUpdatedAt(rows: SportfunPriceListRow[]): string | null {
  let best: number | null = null;
  for (const row of rows) {
    const ts = Date.parse(row.updatedAt ?? row.asOf ?? "");
    if (!Number.isFinite(ts)) continue;
    if (best === null || ts > best) best = ts;
  }
  return best === null ? null : new Date(best).toISOString();
}

function buildQuery(params: { page: number; pageSize: number; tokenIdOnly: boolean }): string {
  const q = new URLSearchParams();
  q.set("page", String(params.page));
  q.set("pageSize", String(params.pageSize));
  if (params.tokenIdOnly) q.set("tokenIdOnly", "1");
  return q.toString();
}

export default async function SportfunPricesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const rawPage = Array.isArray(query.page) ? query.page[0] : query.page;
  const rawPageSize = Array.isArray(query.pageSize) ? query.pageSize[0] : query.pageSize;
  const rawTokenIdOnly = Array.isArray(query.tokenIdOnly) ? query.tokenIdOnly[0] : query.tokenIdOnly;

  const page = Math.max(1, parsePositiveInt(rawPage, 1));
  const requestedPageSize = parsePositiveInt(rawPageSize, 200);
  const pageSize = PAGE_SIZES.includes(requestedPageSize as (typeof PAGE_SIZES)[number])
    ? requestedPageSize
    : 200;
  const tokenIdOnly = rawTokenIdOnly === "1" || rawTokenIdOnly === "true";
  const offset = (page - 1) * pageSize;

  const rows = await listStoredSportfunPrices({
    limit: pageSize,
    offset,
    tokenIdOnly,
  });

  const hasPrev = page > 1;
  const hasNext = rows.length === pageSize;
  const priceStoreConfigured = isSportfunPriceStoreConfigured();
  const uniqueContracts = new Set(rows.map((r) => r.tokenAddress)).size;
  const lastUpdate = latestUpdatedAt(rows);

  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Sport.fun prices</h1>
          <p className="mt-1 text-sm text-gray-400">
            Current token prices from Supabase table `public.sportfun_token_prices`.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <a className="text-sm text-blue-400 hover:underline" href="/api/sportfun/prices/refresh">
            Refresh prices
          </a>
          <Link className="text-sm text-blue-400 hover:underline" href="/">
            Home
          </Link>
        </div>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Rows (current page)</div>
          <div className="mt-2 text-xl text-white">{rows.length}</div>
          <p className="mt-1 text-xs text-gray-500">
            page {page}, size {pageSize}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Unique contracts</div>
          <div className="mt-2 text-xl text-white">{uniqueContracts}</div>
          <p className="mt-1 text-xs text-gray-500">in current page</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Latest update (page)</div>
          <div className="mt-2 text-sm text-white">{lastUpdate ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Supabase</div>
          <div className="mt-2 text-xl text-white">{priceStoreConfigured ? "connected" : "not configured"}</div>
          <p className="mt-1 text-xs text-gray-500">source of truth for this page</p>
        </div>
      </section>

      <section className="mt-6 flex flex-wrap items-center gap-3">
        <span className="text-sm text-gray-400">Page size:</span>
        {PAGE_SIZES.map((size) => {
          const href = `/sportfun/prices?${buildQuery({ page: 1, pageSize: size, tokenIdOnly })}`;
          const active = pageSize === size;
          return (
            <Link
              key={size}
              href={href}
              className={`rounded-md border px-2 py-1 text-sm ${
                active
                  ? "border-blue-400 bg-blue-400/10 text-blue-300"
                  : "border-white/15 bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
            >
              {size}
            </Link>
          );
        })}
        <Link
          href={`/sportfun/prices?${buildQuery({ page: 1, pageSize, tokenIdOnly: !tokenIdOnly })}`}
          className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-sm text-gray-300 hover:bg-white/10"
        >
          {tokenIdOnly ? "Show all rows" : "Only token_id rows"}
        </Link>
      </section>

      <section className="mt-4 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-white/5 text-left text-gray-300">
            <tr>
              <th className="p-3">#</th>
              <th className="p-3">Contract</th>
              <th className="p-3">Token ID</th>
              <th className="p-3">Price (USDC)</th>
              <th className="p-3">Price raw</th>
              <th className="p-3">Source</th>
              <th className="p-3">As of</th>
              <th className="p-3">Updated at</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((row, idx) => (
              <tr key={`${row.chain}:${row.tokenAddress}:${row.tokenId ?? "null"}`} className="text-gray-200">
                <td className="p-3 text-gray-400">{offset + idx + 1}</td>
                <td className="p-3 whitespace-nowrap">
                  <a
                    className="text-blue-400 hover:underline"
                    href={`https://basescan.org/token/${row.tokenAddress}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {shortenAddress(row.tokenAddress)}
                  </a>
                </td>
                <td className="p-3 whitespace-nowrap">{row.tokenId ?? "—"}</td>
                <td className="p-3 whitespace-nowrap">{formatUsdc(row.priceUsdcRaw)}</td>
                <td className="p-3 whitespace-nowrap text-gray-400">{row.priceUsdcRaw}</td>
                <td className="p-3 whitespace-nowrap">{row.source}</td>
                <td className="p-3 whitespace-nowrap text-gray-400">{formatTs(row.asOf)}</td>
                <td className="p-3 whitespace-nowrap text-gray-400">{formatTs(row.updatedAt)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="p-4 text-gray-400" colSpan={8}>
                  No rows in Supabase for this filter/page.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="mt-4 flex items-center justify-between">
        <div className="text-xs text-gray-500">
          Data source: Supabase only. No blockchain price calls are used on this page.
        </div>
        <div className="flex items-center gap-3">
          {hasPrev ? (
            <Link
              href={`/sportfun/prices?${buildQuery({ page: page - 1, pageSize, tokenIdOnly })}`}
              className="rounded-md border border-white/15 bg-white/5 px-3 py-1 text-sm text-gray-200 hover:bg-white/10"
            >
              Prev
            </Link>
          ) : (
            <span className="rounded-md border border-white/10 px-3 py-1 text-sm text-gray-500">Prev</span>
          )}
          {hasNext ? (
            <Link
              href={`/sportfun/prices?${buildQuery({ page: page + 1, pageSize, tokenIdOnly })}`}
              className="rounded-md border border-white/15 bg-white/5 px-3 py-1 text-sm text-gray-200 hover:bg-white/10"
            >
              Next
            </Link>
          ) : (
            <span className="rounded-md border border-white/10 px-3 py-1 text-sm text-gray-500">Next</span>
          )}
        </div>
      </section>
    </main>
  );
}
