import Link from "next/link";
import SportsfunPageShell from "../../_components/SportsfunPageShell";
import { formatCompactNumber, formatDateTime, formatPercent, formatSignedUsd, formatUsd } from "../../_components/format";
import {
  getSportsfunTrackedWallets,
  getSportsfunWallet,
  getSportsfunWalletDailyTradeStats,
  getSportsfunWalletHoldings,
  getSportsfunWalletHoldingsValue,
  getSportsfunWalletPnlDistribution,
  getSportsfunWalletTradeStats,
  getSportsfunWalletTrades,
  getSportsfunWalletTransfers,
  type SportsfunWalletTradeStatsTimeframe,
} from "@/lib/teneroSportsfun";
import { shortenAddress } from "@/lib/format";

type WalletTab = "trades" | "transfers";

function isEvmAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function parseTimeframe(value: string | undefined): SportsfunWalletTradeStatsTimeframe {
  if (value === "1d" || value === "7d" || value === "30d" || value === "all") return value;
  return "30d";
}

function parseTab(value: string | undefined): WalletTab {
  if (value === "transfers") return "transfers";
  return "trades";
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

async function safeLoad<T>(loader: () => Promise<T>, fallback: T): Promise<{ data: T; error?: string }> {
  try {
    return { data: await loader() };
  } catch (error: unknown) {
    return { data: fallback, error: describeError(error) };
  }
}

function extractTrackedWallets(value: unknown): string[] {
  const records: unknown[] = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { rows?: unknown[] }).rows)
      ? ((value as { rows?: unknown[] }).rows ?? [])
      : [];

  const out = new Set<string>();
  for (const entry of records) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const wallet =
      (typeof record.wallet === "string" && record.wallet) ||
      (typeof record.address === "string" && record.address) ||
      (typeof record.wallet_address === "string" && record.wallet_address) ||
      "";
    if (wallet && isEvmAddress(wallet)) out.add(wallet.toLowerCase());
  }
  return [...out];
}

function buildWalletHref(params: {
  address: string;
  timeframe: SportsfunWalletTradeStatsTimeframe;
  tab: WalletTab;
  label?: string;
}) {
  const query = new URLSearchParams();
  query.set("timeframe", params.timeframe);
  query.set("tab", params.tab);
  if (params.label) query.set("label", params.label);
  return `/sportsfun/wallet/${params.address}?${query.toString()}`;
}

function cellClassForNetflow(value: number, maxAbs: number): string {
  if (value === 0) return "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500";
  const ratio = Math.abs(value) / Math.max(1, maxAbs);
  if (value > 0) {
    if (ratio > 0.7) return "bg-emerald-500/30 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-200";
    if (ratio > 0.35) return "bg-emerald-400/20 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200";
    return "bg-emerald-300/15 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200";
  }
  if (ratio > 0.7) return "bg-rose-500/30 text-rose-700 dark:bg-rose-500/25 dark:text-rose-200";
  if (ratio > 0.35) return "bg-rose-400/20 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200";
  return "bg-rose-300/15 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200";
}

export default async function SportsfunWalletPage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<{ timeframe?: string; tab?: string; label?: string }>;
}) {
  const { address } = await params;
  const query = await searchParams;

  const timeframe = parseTimeframe(query.timeframe);
  const tab = parseTab(query.tab);
  const customLabel = query.label?.trim() ?? "";

  if (!isEvmAddress(address)) {
    return (
      <SportsfunPageShell title="sports.fun Wallet" description="Wallet analytics view">
        <section className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          Invalid wallet address: {address}
        </section>
      </SportsfunPageShell>
    );
  }

  const [
    walletResult,
    holdingsValueResult,
    pnlDistributionResult,
    tradeStatsResult,
    dailyStatsResult,
    holdingsResult,
    tradesResult,
    transfersResult,
    trackedResult,
  ] = await Promise.all([
    safeLoad(() => getSportsfunWallet(address), {
      address,
      name: null,
      native_transfer: null,
      first_and_last_tx: null,
    }),
    safeLoad(() => getSportsfunWalletHoldingsValue(address), {
      wallet_address: address,
      native_amount: 0,
      native_value_usd: 0,
      token_value_usd: 0,
      total_value_usd: 0,
      total_raw_value_usd: 0,
      total_adjusted_value_usd: 0,
      token_count: 0,
    }),
    safeLoad(() => getSportsfunWalletPnlDistribution(address), null),
    safeLoad(() => getSportsfunWalletTradeStats(address, timeframe), {
      buy_count: 0,
      sell_count: 0,
      swap_count: 0,
      add_liquidity_count: 0,
      remove_liquidity_count: 0,
      liquidity_count: 0,
      total_trades: 0,
      buy_volume_usd: 0,
      sell_volume_usd: 0,
      swap_volume_usd: 0,
      add_volume_usd: 0,
      remove_volume_usd: 0,
      liquidity_volume_usd: 0,
      total_volume_usd: 0,
      avg_buy_volume_usd: 0,
      avg_sell_volume_usd: 0,
      avg_swap_volume_usd: 0,
      avg_add_volume_usd: 0,
      avg_remove_volume_usd: 0,
      avg_liquidity_volume_usd: 0,
      trade_netflow_usd: 0,
      liquidity_netflow_usd: 0,
      unique_pools_traded: 0,
      unique_pools_liquidity: 0,
      unique_pools_total: 0,
      unique_tokens_traded: 0,
      unique_tokens_liquidity: 0,
      unique_tokens_total: 0,
      unique_platforms_traded: 0,
      unique_platforms_liquidity: 0,
      unique_platforms_total: 0,
    }),
    safeLoad(() => getSportsfunWalletDailyTradeStats(address, { timeframe: "30d" }), []),
    safeLoad(() => getSportsfunWalletHoldings(address, { limit: 100 }), { rows: [], next: null }),
    safeLoad(() => getSportsfunWalletTrades(address, { limit: 80 }), { rows: [], next: null }),
    safeLoad(() => getSportsfunWalletTransfers(address, { limit: 80 }), { rows: [], next: null }),
    safeLoad(() => getSportsfunTrackedWallets(), { data: null, authRequired: true }),
  ]);

  const loadErrors = [
    walletResult.error,
    holdingsValueResult.error,
    pnlDistributionResult.error,
    tradeStatsResult.error,
    dailyStatsResult.error,
    holdingsResult.error,
    tradesResult.error,
    transfersResult.error,
    trackedResult.error,
  ].filter(Boolean) as string[];

  const wallet = walletResult.data;
  const holdingsValue = holdingsValueResult.data;
  const tradeStats = tradeStatsResult.data;
  const dailyStats = dailyStatsResult.data;
  const holdings = holdingsResult.data.rows;
  const trades = tradesResult.data.rows;
  const transfers = transfersResult.data.rows;
  const pnlDistribution = pnlDistributionResult.data;

  const trackedWallets = extractTrackedWallets(trackedResult.data.data);
  const trackedState = trackedWallets.includes(address.toLowerCase())
    ? "Tracked"
    : trackedResult.data.authRequired
      ? "Unknown (auth required)"
      : "Not tracked";

  const resolvedLabel = customLabel || wallet.name || shortenAddress(address);
  const holdingsRows = holdings.map((row) => {
    const buyUsd = row.trade_stats?.buy_amount_usd ?? 0;
    const sellUsd = row.trade_stats?.sell_amount_usd ?? 0;
    const realizedPnl = row.trade_stats?.realized_pnl_usd ?? 0;
    const currentValue = row.balance_value_usd ?? 0;
    const estimatedUnrealized = currentValue - Math.max(0, buyUsd - sellUsd);
    const totalPnl = realizedPnl + estimatedUnrealized;
    return {
      ...row,
      buyUsd,
      sellUsd,
      realizedPnl,
      estimatedUnrealized,
      totalPnl,
      active: Number(row.balance ?? 0) > 0,
    };
  });

  const dailyMap = new Map(dailyStats.map((point) => [point.date, point]));
  const calendarDays: Array<{ date: string; netflowUsd: number; buyCount: number; sellCount: number }> = [];
  for (let offset = 30; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - offset);
    const key = date.toISOString().slice(0, 10);
    const point = dailyMap.get(key);
    calendarDays.push({
      date: key,
      netflowUsd: point?.netflow_usd ?? 0,
      buyCount: point?.buy_count ?? 0,
      sellCount: point?.sell_count ?? 0,
    });
  }
  const maxAbsNetflow = calendarDays.reduce((acc, day) => Math.max(acc, Math.abs(day.netflowUsd)), 0);

  const pnlBuckets = pnlDistribution
    ? [
        { label: "< -50%", count: pnlDistribution.pnl_lt_50_neg, value: pnlDistribution.realized_pnl_lt_50_neg },
        { label: "-50% to 0%", count: pnlDistribution.pnl_neg50_to_0, value: pnlDistribution.realized_pnl_neg50_to_0 },
        { label: "0% to 200%", count: pnlDistribution.pnl_0_to_200, value: pnlDistribution.realized_pnl_0_to_200 },
        { label: "200% to 500%", count: pnlDistribution.pnl_200_to_500, value: pnlDistribution.realized_pnl_200_to_500 },
        { label: "> 500%", count: pnlDistribution.pnl_gt_500, value: pnlDistribution.realized_pnl_gt_500 },
      ]
    : [];

  return (
    <SportsfunPageShell
      title="sports.fun Wallet"
      description="Wallet analytics parity view with PnL, funding, trades, transfers and holdings modules."
      searchQuery={address}
    >
      {loadErrors.length ? (
        <section className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          Partial data load: {loadErrors[0]}
        </section>
      ) : null}

      <section className="mt-6 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Wallet profile</div>
            <h2 className="mt-1 text-2xl font-semibold text-black dark:text-white">{resolvedLabel}</h2>
            <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{address}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-black/10 px-2 py-0.5 text-zinc-600 dark:border-white/10 dark:text-zinc-300">
                {trackedState}
              </span>
              <a
                href={`https://basescan.org/address/${address}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-blue-300 px-2 py-0.5 text-blue-700 hover:underline dark:border-blue-400/30 dark:text-blue-300"
              >
                Open in BaseScan
              </a>
            </div>
          </div>
          <form method="get" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="timeframe" value={timeframe} />
            <input type="hidden" name="tab" value={tab} />
            <input
              name="label"
              defaultValue={customLabel}
              placeholder="Editable label"
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-black dark:text-white"
            />
            <button
              type="submit"
              className="rounded-lg border border-black bg-black px-3 py-2 text-sm text-white hover:bg-zinc-800 dark:border-white dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Save label
            </button>
          </form>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">USDC / native</div>
          <div className="mt-2 text-xl font-semibold text-black dark:text-white">{formatUsd(holdingsValue.native_value_usd)}</div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">Native amount: {formatCompactNumber(holdingsValue.native_amount)}</div>
        </article>
        <article className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total value</div>
          <div className="mt-2 text-xl font-semibold text-black dark:text-white">{formatUsd(holdingsValue.total_value_usd)}</div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">Token value: {formatUsd(holdingsValue.token_value_usd)}</div>
        </article>
        <article className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Token holdings</div>
          <div className="mt-2 text-xl font-semibold text-black dark:text-white">{formatCompactNumber(holdingsValue.token_count)}</div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">Unique assets</div>
        </article>
        <article className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Trade netflow ({timeframe})</div>
          <div
            className={`mt-2 text-xl font-semibold ${
              tradeStats.trade_netflow_usd >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"
            }`}
          >
            {formatSignedUsd(tradeStats.trade_netflow_usd)}
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">Total trades: {formatCompactNumber(tradeStats.total_trades)}</div>
        </article>
      </section>

      <section className="mt-8 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          {(["1d", "7d", "30d", "all"] as SportsfunWalletTradeStatsTimeframe[]).map((option) => (
            <Link
              key={option}
              href={buildWalletHref({
                address,
                timeframe: option,
                tab,
                label: customLabel || undefined,
              })}
              className={`rounded-full border px-3 py-1 ${
                option === timeframe
                  ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                  : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              }`}
            >
              {option}
            </Link>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Buy/Sell trades</div>
            <div className="mt-1 text-lg font-semibold text-black dark:text-white">
              {formatCompactNumber(tradeStats.buy_count)} / {formatCompactNumber(tradeStats.sell_count)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Trade volume</div>
            <div className="mt-1 text-lg font-semibold text-black dark:text-white">{formatUsd(tradeStats.total_volume_usd)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Add / remove liq</div>
            <div className="mt-1 text-lg font-semibold text-black dark:text-white">
              {formatCompactNumber(tradeStats.add_liquidity_count)} / {formatCompactNumber(tradeStats.remove_liquidity_count)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Avg buy / sell</div>
            <div className="mt-1 text-lg font-semibold text-black dark:text-white">
              {formatUsd(tradeStats.avg_buy_volume_usd)} / {formatUsd(tradeStats.avg_sell_volume_usd)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Traded tokens/pools</div>
            <div className="mt-1 text-lg font-semibold text-black dark:text-white">
              {formatCompactNumber(tradeStats.unique_tokens_total)} / {formatCompactNumber(tradeStats.unique_pools_total)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Platforms</div>
            <div className="mt-1 text-lg font-semibold text-black dark:text-white">{formatCompactNumber(tradeStats.unique_platforms_total)}</div>
          </div>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-sm font-medium text-black dark:text-white">PnL distribution</div>
          {pnlDistribution ? (
            <>
              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                Winrate: {formatPercent(pnlDistribution.winrate * 100)} | Tokens with data:{" "}
                {formatCompactNumber(pnlDistribution.total_tokens_with_trade_data)}
              </div>
              <div className="mt-3 space-y-2">
                {pnlBuckets.map((bucket) => (
                  <div key={bucket.label} className="rounded-lg border border-black/10 px-3 py-2 dark:border-white/10">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-black dark:text-white">{bucket.label}</span>
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">{formatCompactNumber(bucket.count)}</span>
                    </div>
                    <div
                      className={`mt-1 text-xs ${
                        bucket.value >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"
                      }`}
                    >
                      Realized: {formatSignedUsd(bucket.value)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              PnL distribution unavailable for this wallet right now (endpoint can return 500).
            </div>
          )}
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-sm font-medium text-black dark:text-white">PnL calendar (30d)</div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
            Daily netflow proxy from wallet daily trade stats.
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1">
            {calendarDays.map((day) => (
              <div
                key={day.date}
                title={`${day.date} | netflow ${formatSignedUsd(day.netflowUsd)} | buys ${day.buyCount} | sells ${day.sellCount}`}
                className={`rounded px-1 py-2 text-center text-[10px] ${cellClassForNetflow(day.netflowUsd, maxAbsNetflow)}`}
              >
                {day.date.slice(-2)}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-sm font-medium text-black dark:text-white">Funding</div>
          {wallet.native_transfer ? (
            <div className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
              <div>
                Source:{" "}
                <Link className="text-blue-600 hover:underline dark:text-blue-300" href={`/sportsfun/wallet/${wallet.native_transfer.sender.address}`}>
                  {wallet.native_transfer.sender.name || shortenAddress(wallet.native_transfer.sender.address)}
                </Link>
              </div>
              <div>Amount: {formatCompactNumber(wallet.native_transfer.amount)}</div>
              <div>Time: {formatDateTime(wallet.native_transfer.transfer_time)}</div>
              <div className="break-all">Tx: {wallet.native_transfer.tx_id}</div>
            </div>
          ) : (
            <div className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">No funding summary available.</div>
          )}
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-sm font-medium text-black dark:text-white">Transactions sent summary</div>
          {wallet.first_and_last_tx ? (
            <div className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
              <div>First activity: {formatDateTime(wallet.first_and_last_tx.first_tx_time)}</div>
              <div>Last activity: {formatDateTime(wallet.first_and_last_tx.last_tx_time)}</div>
              <div>First tx id: {wallet.first_and_last_tx.first_tx_id}</div>
              <div>Last tx id: {wallet.first_and_last_tx.last_tx_id}</div>
            </div>
          ) : (
            <div className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">No tx summary available.</div>
          )}
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <Link
            href={buildWalletHref({
              address,
              timeframe,
              tab: "trades",
              label: customLabel || undefined,
            })}
            className={`rounded-full border px-3 py-1 ${
              tab === "trades"
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
          >
            Trades
          </Link>
          <Link
            href={buildWalletHref({
              address,
              timeframe,
              tab: "transfers",
              label: customLabel || undefined,
            })}
            className={`rounded-full border px-3 py-1 ${
              tab === "transfers"
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
          >
            Transfers
          </Link>
        </div>

        {tab === "trades" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Token</th>
                  <th className="px-3 py-2 text-right">Amount USD</th>
                  <th className="px-3 py-2">Pool</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr key={`${trade.tx_id}-${trade.event_index}`} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatDateTime(trade.block_time)}</td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{trade.event_type}</td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                      {trade.base_token?.symbol ?? trade.base_token_address}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatSignedUsd(trade.amount_usd)}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{trade.pool_id}</td>
                  </tr>
                ))}
                {trades.length === 0 ? (
                  <tr>
                    <td className="px-3 py-5 text-zinc-500 dark:text-zinc-400" colSpan={5}>
                      No trades found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Token</th>
                  <th className="px-3 py-2">From</th>
                  <th className="px-3 py-2">To</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((transfer) => (
                  <tr key={`${transfer.tx_id}-${transfer.event_index}`} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatDateTime(transfer.block_time)}</td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{transfer.token?.symbol ?? transfer.token_address}</td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{shortenAddress(transfer.from_address)}</td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{shortenAddress(transfer.to_address)}</td>
                    <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatCompactNumber(transfer.amount)}</td>
                  </tr>
                ))}
                {transfers.length === 0 ? (
                  <tr>
                    <td className="px-3 py-5 text-zinc-500 dark:text-zinc-400" colSpan={5}>
                      No transfers found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8 overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
        <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
          Holdings parity table
        </div>
        <table className="w-full min-w-[1300px] text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">Token</th>
              <th className="px-3 py-2 text-right">Balance</th>
              <th className="px-3 py-2 text-right">Bought</th>
              <th className="px-3 py-2 text-right">Sold</th>
              <th className="px-3 py-2 text-right">Avg B/S</th>
              <th className="px-3 py-2 text-right">Realized PnL</th>
              <th className="px-3 py-2 text-right">Unrealized PnL</th>
              <th className="px-3 py-2 text-right">Total PnL</th>
              <th className="px-3 py-2 text-center">Active</th>
            </tr>
          </thead>
          <tbody>
            {holdingsRows.map((row) => (
              <tr key={row.token_address} className="border-t border-black/10 dark:border-white/10">
                <td className="px-3 py-2">
                  <div className="font-medium text-black dark:text-white">{row.token?.name}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">{row.token?.symbol}</div>
                </td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatCompactNumber(Number(row.balance ?? 0))}</td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatUsd(row.buyUsd)}</td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatUsd(row.sellUsd)}</td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">
                  {formatUsd(row.trade_stats?.avg_buy_price_usd)} / {formatUsd(row.trade_stats?.avg_sell_price_usd)}
                </td>
                <td
                  className={`px-3 py-2 text-right ${
                    row.realizedPnl >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"
                  }`}
                >
                  {formatSignedUsd(row.realizedPnl)}
                </td>
                <td
                  className={`px-3 py-2 text-right ${
                    row.estimatedUnrealized >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"
                  }`}
                >
                  {formatSignedUsd(row.estimatedUnrealized)}
                </td>
                <td
                  className={`px-3 py-2 text-right ${
                    row.totalPnl >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"
                  }`}
                >
                  {formatSignedUsd(row.totalPnl)}
                </td>
                <td className="px-3 py-2 text-center text-zinc-700 dark:text-zinc-300">{row.active ? "Yes" : "No"}</td>
              </tr>
            ))}
            {holdingsRows.length === 0 ? (
              <tr>
                <td className="px-3 py-5 text-zinc-500 dark:text-zinc-400" colSpan={9}>
                  No holdings rows found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="mt-4 text-xs text-zinc-500 dark:text-zinc-500">
        Data source: Tenero public wallet endpoints. PnL distribution may be unavailable for some wallets due upstream `500`.
      </section>
    </SportsfunPageShell>
  );
}
