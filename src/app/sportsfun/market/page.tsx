import Link from "next/link";
import SportsfunPageShell from "../_components/SportsfunPageShell";
import { formatDateTime, formatPercent, formatSignedUsd, formatUsd } from "../_components/format";
import {
  type SportsfunFlowTimeframe,
  type SportsfunGainerTimeframe,
  type SportsfunHourlyNetflowTimeframe,
  getSportsfunHourlyNetflow,
  getSportsfunTopGainers,
  getSportsfunTopInflows,
  getSportsfunTopOutflows,
  getSportsfunWhaleTrades,
} from "@/lib/teneroSportsfun";
import { shortenAddress } from "@/lib/format";

const FLOW_TIMEFRAMES: SportsfunFlowTimeframe[] = ["1h", "4h", "1d", "7d", "30d", "all"];
const HOURLY_TIMEFRAMES: SportsfunHourlyNetflowTimeframe[] = ["1d", "7d", "30d", "90d"];
const WHALE_OPTIONS = [5000, 10000, 20000, 50000, 100000, 200000] as const;

function parseFlowTimeframe(value: string | undefined): SportsfunFlowTimeframe {
  if (value === "1h" || value === "4h" || value === "1d" || value === "7d" || value === "30d" || value === "all") {
    return value;
  }
  return "1d";
}

function parseHourlyTimeframe(value: string | undefined): SportsfunHourlyNetflowTimeframe {
  if (value === "1d" || value === "7d" || value === "30d" || value === "90d") return value;
  return "7d";
}

function parseWhaleMin(value: string | undefined): 5000 | 10000 | 20000 | 50000 | 100000 | 200000 {
  if (value === "5000") return 5000;
  if (value === "10000") return 10000;
  if (value === "20000") return 20000;
  if (value === "50000") return 50000;
  if (value === "100000") return 100000;
  if (value === "200000") return 200000;
  return 10000;
}

function toGainerTimeframe(value: SportsfunFlowTimeframe): SportsfunGainerTimeframe {
  if (value === "all") return "30d";
  return value;
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

export default async function SportsfunMarketPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const flowTimeframe = parseFlowTimeframe(String(Array.isArray(query.flow) ? query.flow[0] : query.flow));
  const hourlyTimeframe = parseHourlyTimeframe(String(Array.isArray(query.netflow) ? query.netflow[0] : query.netflow));
  const whaleMin = parseWhaleMin(String(Array.isArray(query.whaleMin) ? query.whaleMin[0] : query.whaleMin));

  let loadError: string | null = null;
  let gainers: Awaited<ReturnType<typeof getSportsfunTopGainers>> = [];
  let inflows: Awaited<ReturnType<typeof getSportsfunTopInflows>> = [];
  let outflows: Awaited<ReturnType<typeof getSportsfunTopOutflows>> = [];
  let hourlyNetflow: Awaited<ReturnType<typeof getSportsfunHourlyNetflow>> = [];
  let whaleTrades: Awaited<ReturnType<typeof getSportsfunWhaleTrades>> = [];

  try {
    [gainers, inflows, outflows, hourlyNetflow, whaleTrades] = await Promise.all([
      getSportsfunTopGainers(toGainerTimeframe(flowTimeframe)),
      getSportsfunTopInflows(flowTimeframe),
      getSportsfunTopOutflows(flowTimeframe),
      getSportsfunHourlyNetflow(hourlyTimeframe),
      getSportsfunWhaleTrades(whaleMin, 50),
    ]);
  } catch (error: unknown) {
    loadError = describeError(error);
  }

  const netflowTotal = hourlyNetflow.reduce((acc, point) => acc + point.netflow, 0);
  const netflowPositive = hourlyNetflow.reduce((acc, point) => acc + (point.netflow > 0 ? point.netflow : 0), 0);
  const netflowNegative = hourlyNetflow.reduce((acc, point) => acc + (point.netflow < 0 ? point.netflow : 0), 0);

  return (
    <SportsfunPageShell
      title="sports.fun Market Flow"
      description="Top inflows/outflows, whale trades, and market netflow telemetry."
      actions={
        <>
          {FLOW_TIMEFRAMES.map((option) => {
            const active = option === flowTimeframe;
            return (
              <Link
                key={`flow-${option}`}
                href={`/sportsfun/market?flow=${option}&netflow=${hourlyTimeframe}&whaleMin=${whaleMin}`}
                className={`rounded-full border px-3 py-1 text-xs ${
                  active
                    ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                }`}
              >
                flow {option}
              </Link>
            );
          })}
        </>
      }
    >
      {loadError ? (
        <section className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          Failed to load market flow data: {loadError}
        </section>
      ) : null}

      <section className="mt-6 flex flex-wrap items-center gap-2">
        {HOURLY_TIMEFRAMES.map((option) => {
          const active = option === hourlyTimeframe;
          return (
            <Link
              key={`netflow-${option}`}
              href={`/sportsfun/market?flow=${flowTimeframe}&netflow=${option}&whaleMin=${whaleMin}`}
              className={`rounded-full border px-3 py-1 text-xs ${
                active
                  ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                  : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              }`}
            >
              netflow {option}
            </Link>
          );
        })}
        {WHALE_OPTIONS.map((amount) => {
          const active = amount === whaleMin;
          return (
            <Link
              key={`whale-${amount}`}
              href={`/sportsfun/market?flow=${flowTimeframe}&netflow=${hourlyTimeframe}&whaleMin=${amount}`}
              className={`rounded-full border px-3 py-1 text-xs ${
                active
                  ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                  : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              }`}
            >
              whale ≥ {formatUsd(amount)}
            </Link>
          );
        })}
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Netflow sum ({hourlyTimeframe})</div>
          <div
            className={`mt-2 text-2xl font-semibold ${
              netflowTotal >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"
            }`}
          >
            {formatSignedUsd(netflowTotal)}
          </div>
        </article>
        <article className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Positive flow</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">
            {formatSignedUsd(netflowPositive)}
          </div>
        </article>
        <article className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Negative flow</div>
          <div className="mt-2 text-2xl font-semibold text-rose-600 dark:text-rose-300">
            {formatSignedUsd(netflowNegative)}
          </div>
        </article>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Top gainers ({toGainerTimeframe(flowTimeframe)})
          </div>
          <table className="w-full text-sm">
            <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Token</th>
                <th className="px-3 py-2 text-right">Δ</th>
              </tr>
            </thead>
            <tbody>
              {gainers.slice(0, 12).map((row) => (
                <tr key={row.address} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2">
                    <div className="font-medium text-black dark:text-white">{row.symbol}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">{row.name}</div>
                  </td>
                  <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-300">
                    {formatPercent(row.price?.price_change_1d_pct)}
                  </td>
                </tr>
              ))}
              {gainers.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-500 dark:text-zinc-400" colSpan={2}>
                    No gainers data.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Top inflows ({flowTimeframe})
          </div>
          <table className="w-full text-sm">
            <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Wallet</th>
                <th className="px-3 py-2 text-right">Netflow</th>
              </tr>
            </thead>
            <tbody>
              {inflows.slice(0, 12).map((row) => (
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
                    No inflow rows.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Top outflows ({flowTimeframe})
          </div>
          <table className="w-full text-sm">
            <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Wallet</th>
                <th className="px-3 py-2 text-right">Netflow</th>
              </tr>
            </thead>
            <tbody>
              {outflows.slice(0, 12).map((row) => (
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
                    No outflow rows.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Whale trades (min {formatUsd(whaleMin)})
          </div>
          <table className="w-full text-sm">
            <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Wallet</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {whaleTrades.slice(0, 20).map((row) => (
                <tr key={`${row.tx_id}-${row.event_type}`} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatDateTime(row.block_time)}</td>
                  <td className="px-3 py-2">
                    <Link className="text-blue-600 hover:underline dark:text-blue-300" href={`/sportsfun/wallet/${row.maker}`}>
                      {shortenAddress(row.maker)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatUsd(row.amount_usd)}</td>
                </tr>
              ))}
              {whaleTrades.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-500 dark:text-zinc-400" colSpan={3}>
                    No whale trades for selected threshold.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Market netflow points ({hourlyTimeframe})
          </div>
          <table className="w-full text-sm">
            <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Timestamp</th>
                <th className="px-3 py-2 text-right">Netflow</th>
              </tr>
            </thead>
            <tbody>
              {hourlyNetflow.slice(-24).reverse().map((point) => (
                <tr key={point.timestamp} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatDateTime(point.timestamp)}</td>
                  <td
                    className={`px-3 py-2 text-right ${
                      point.netflow >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"
                    }`}
                  >
                    {formatSignedUsd(point.netflow)}
                  </td>
                </tr>
              ))}
              {hourlyNetflow.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-500 dark:text-zinc-400" colSpan={2}>
                    No netflow points.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </SportsfunPageShell>
  );
}
