import Link from "next/link";
import SportsfunPageShell from "./_components/SportsfunPageShell";
import { formatCompactNumber, formatDateOnly, formatSignedUsd, formatUsd } from "./_components/format";
import {
  type SportsfunMarketStatsTimeframe,
  getSportsfunMarketStats,
  getSportsfunTokens,
  getSportsfunTopInflows,
  getSportsfunTopOutflows,
} from "@/lib/teneroSportsfun";
import { shortenAddress } from "@/lib/format";

const TIMEFRAMES: SportsfunMarketStatsTimeframe[] = ["30d", "90d", "180d", "1y"];

function parseTimeframe(value: string | undefined): SportsfunMarketStatsTimeframe {
  if (value === "30d" || value === "90d" || value === "180d" || value === "1y") return value;
  return "30d";
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

export default async function SportsfunOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ timeframe?: string }>;
}) {
  const params = await searchParams;
  const timeframe = parseTimeframe(params.timeframe);

  let loadError: string | null = null;
  let stats: Awaited<ReturnType<typeof getSportsfunMarketStats>> = [];
  let inflows: Awaited<ReturnType<typeof getSportsfunTopInflows>> = [];
  let outflows: Awaited<ReturnType<typeof getSportsfunTopOutflows>> = [];
  let topToken: Awaited<ReturnType<typeof getSportsfunTokens>>["rows"][number] | null = null;

  try {
    [stats, inflows, outflows, topToken] = await Promise.all([
      getSportsfunMarketStats(timeframe),
      getSportsfunTopInflows("1d"),
      getSportsfunTopOutflows("1d"),
      getSportsfunTokens({
        limit: 1,
        order: "volume_1d_usd",
        direction: "DESC",
      }).then((page) => page.rows[0] ?? null),
    ]);
  } catch (error: unknown) {
    loadError = describeError(error);
  }

  const totalVolumeUsd = stats.reduce((acc, point) => acc + point.volume_usd, 0);
  const totalNetflowUsd = stats.reduce((acc, point) => acc + point.netflow_usd, 0);
  const activeTraders = stats.length ? stats[stats.length - 1]?.unique_traders ?? 0 : 0;
  const latestPeriod = stats.length ? stats[stats.length - 1]?.period : undefined;
  const topInflow = inflows[0];
  const topOutflow = outflows[0];

  return (
    <SportsfunPageShell
      title="sports.fun Hub"
      description="Chain-level overview for volume, netflow, active traders, and top market activity."
      actions={TIMEFRAMES.map((option) => {
        const active = option === timeframe;
        return (
          <Link
            key={option}
            href={`/sportsfun?timeframe=${option}`}
            className={`rounded-full border px-3 py-1 text-xs ${
              active
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
          >
            {option}
          </Link>
        );
      })}
    >
      {loadError ? (
        <section className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          Unable to load sports.fun data from Tenero API: {loadError}
        </section>
      ) : null}

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Volume ({timeframe})</div>
          <div className="mt-2 text-2xl font-semibold text-black dark:text-white">{formatUsd(totalVolumeUsd)}</div>
        </article>
        <article className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Netflow ({timeframe})</div>
          <div
            className={`mt-2 text-2xl font-semibold ${
              totalNetflowUsd >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"
            }`}
          >
            {formatSignedUsd(totalNetflowUsd)}
          </div>
        </article>
        <article className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Active traders</div>
          <div className="mt-2 text-2xl font-semibold text-black dark:text-white">{formatCompactNumber(activeTraders)}</div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">Latest period: {latestPeriod ?? "—"}</div>
        </article>
        <article className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Top market token (24h)</div>
          {topToken ? (
            <>
              <div className="mt-2 text-lg font-semibold text-black dark:text-white">{topToken.name}</div>
              <div className="text-sm text-zinc-500 dark:text-zinc-400">{topToken.symbol}</div>
              <div className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{formatUsd(topToken.metrics?.volume_1d_usd)}</div>
            </>
          ) : (
            <div className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">No token data</div>
          )}
        </article>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Top inflows (1d)
          </div>
          <table className="w-full text-sm">
            <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Wallet</th>
                <th className="px-3 py-2 text-right">Netflow</th>
              </tr>
            </thead>
            <tbody>
              {inflows.slice(0, 10).map((row) => (
                <tr key={row.wallet} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2">
                    <Link className="text-blue-600 hover:underline dark:text-blue-300" href={`/sportsfun/wallet/${row.wallet}`}>
                      {shortenAddress(row.wallet)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-300">
                    {formatSignedUsd(row.netflow_usd)}
                  </td>
                </tr>
              ))}
              {inflows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-500 dark:text-zinc-400" colSpan={2}>
                    No inflow data.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Top outflows (1d)
          </div>
          <table className="w-full text-sm">
            <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Wallet</th>
                <th className="px-3 py-2 text-right">Netflow</th>
              </tr>
            </thead>
            <tbody>
              {outflows.slice(0, 10).map((row) => (
                <tr key={row.wallet} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2">
                    <Link className="text-blue-600 hover:underline dark:text-blue-300" href={`/sportsfun/wallet/${row.wallet}`}>
                      {shortenAddress(row.wallet)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right text-rose-600 dark:text-rose-300">{formatSignedUsd(row.netflow_usd)}</td>
                </tr>
              ))}
              {outflows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-500 dark:text-zinc-400" colSpan={2}>
                    No outflow data.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-black/10 bg-white p-4 text-sm dark:border-white/10 dark:bg-white/5">
        <div className="font-medium text-black dark:text-white">Quick snapshot</div>
        <div className="mt-2 text-zinc-600 dark:text-zinc-400">
          Most recent stats date: <span className="font-medium">{formatDateOnly(latestPeriod)}</span>. Top inflow:
          <span className="ml-1 font-medium text-emerald-600 dark:text-emerald-300">
            {topInflow ? `${shortenAddress(topInflow.wallet)} (${formatSignedUsd(topInflow.netflow_usd)})` : "—"}
          </span>
          . Top outflow:
          <span className="ml-1 font-medium text-rose-600 dark:text-rose-300">
            {topOutflow ? `${shortenAddress(topOutflow.wallet)} (${formatSignedUsd(topOutflow.netflow_usd)})` : "—"}
          </span>
          .
        </div>
      </section>
    </SportsfunPageShell>
  );
}
