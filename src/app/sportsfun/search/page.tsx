import Link from "next/link";
import SportsfunPageShell from "../_components/SportsfunPageShell";
import { formatCompactNumber, formatPercent, formatUsd } from "../_components/format";
import {
  getSportsfunPools,
  getSportsfunTokens,
  getSportsfunWallet,
  getSportsfunWalletHoldingsValue,
  getSportsfunWalletTradeStats,
} from "@/lib/teneroSportsfun";
import { shortenAddress } from "@/lib/format";

function isEvmAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

export default async function SportsfunSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";

  let loadError: string | null = null;
  let tokenRows: Awaited<ReturnType<typeof getSportsfunTokens>>["rows"] = [];
  let poolRows: Awaited<ReturnType<typeof getSportsfunPools>>["rows"] = [];
  let walletSummary:
    | {
        address: string;
        name: string | null;
        totalValueUsd: number;
        tokenCount: number;
        totalTrades: number;
      }
    | null = null;

  if (q) {
    try {
      const [tokensPage, poolsPage] = await Promise.all([
        getSportsfunTokens({
          search: q,
          limit: 20,
          order: "volume_1d_usd",
          direction: "DESC",
        }),
        getSportsfunPools({
          search: q,
          limit: 10,
          order: "volume_1d_usd",
          direction: "DESC",
        }),
      ]);
      tokenRows = tokensPage.rows;
      poolRows = poolsPage.rows;

      if (isEvmAddress(q)) {
        const [wallet, holdingsValue, tradeStats] = await Promise.all([
          getSportsfunWallet(q),
          getSportsfunWalletHoldingsValue(q),
          getSportsfunWalletTradeStats(q, "30d"),
        ]);
        walletSummary = {
          address: wallet.address,
          name: wallet.name,
          totalValueUsd: holdingsValue.total_value_usd,
          tokenCount: holdingsValue.token_count,
          totalTrades: tradeStats.total_trades,
        };
      }
    } catch (error: unknown) {
      loadError = describeError(error);
    }
  }

  return (
    <SportsfunPageShell
      title="sports.fun Search"
      description="Search by token symbol/name/address and wallet address."
      searchQuery={q}
    >
      {!q ? (
        <section className="mt-6 rounded-xl border border-black/10 bg-white p-4 text-sm text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
          Enter a query in the search box to find tokens, pools, and wallet analytics.
        </section>
      ) : null}

      {loadError ? (
        <section className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          Search request failed: {loadError}
        </section>
      ) : null}

      {walletSummary ? (
        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <article className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Wallet</div>
            <div className="mt-2 text-lg font-semibold text-black dark:text-white">
              {walletSummary.name || shortenAddress(walletSummary.address)}
            </div>
            <Link className="mt-2 inline-block text-sm text-blue-600 hover:underline dark:text-blue-300" href={`/sportsfun/wallet/${walletSummary.address}`}>
              Open wallet page
            </Link>
          </article>
          <article className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total value</div>
            <div className="mt-2 text-2xl font-semibold text-black dark:text-white">{formatUsd(walletSummary.totalValueUsd)}</div>
          </article>
          <article className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Tokens / trades (30d)</div>
            <div className="mt-2 text-2xl font-semibold text-black dark:text-white">
              {formatCompactNumber(walletSummary.tokenCount)} / {formatCompactNumber(walletSummary.totalTrades)}
            </div>
          </article>
        </section>
      ) : null}

      <section className="mt-8 overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
        <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
          Token results ({tokenRows.length})
        </div>
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">Token</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Mcap</th>
              <th className="px-3 py-2 text-right">Volume 1d</th>
              <th className="px-3 py-2 text-right">24h Δ</th>
            </tr>
          </thead>
          <tbody>
            {tokenRows.map((row) => (
              <tr key={row.address} className="border-t border-black/10 dark:border-white/10">
                <td className="px-3 py-2">
                  <div className="font-medium text-black dark:text-white">{row.name}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">{row.symbol}</div>
                </td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatUsd(row.price_usd, 6)}</td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatUsd(row.marketcap_usd)}</td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatUsd(row.metrics?.volume_1d_usd)}</td>
                <td
                  className={`px-3 py-2 text-right ${
                    (row.price?.price_change_1d_pct ?? 0) >= 0
                      ? "text-emerald-600 dark:text-emerald-300"
                      : "text-rose-600 dark:text-rose-300"
                  }`}
                >
                  {formatPercent(row.price?.price_change_1d_pct)}
                </td>
              </tr>
            ))}
            {q && tokenRows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-zinc-500 dark:text-zinc-400" colSpan={5}>
                  No token matches.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="mt-8 overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
        <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
          Pool results ({poolRows.length})
        </div>
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">Pool</th>
              <th className="px-3 py-2 text-right">Liquidity</th>
              <th className="px-3 py-2 text-right">Volume 1d</th>
              <th className="px-3 py-2 text-right">Swaps 1d</th>
            </tr>
          </thead>
          <tbody>
            {poolRows.map((row) => (
              <tr key={row.pool_id} className="border-t border-black/10 dark:border-white/10">
                <td className="px-3 py-2">
                  <div className="font-medium text-black dark:text-white">
                    {row.base_token?.symbol}/{row.quote_token?.symbol}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">{row.base_token?.name}</div>
                </td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatUsd(row.liquidity_usd)}</td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatUsd(row.metrics?.volume_1d_usd)}</td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">
                  {formatCompactNumber(Number(row.metrics?.swaps_1d ?? 0))}
                </td>
              </tr>
            ))}
            {q && poolRows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-zinc-500 dark:text-zinc-400" colSpan={4}>
                  No pool matches.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </SportsfunPageShell>
  );
}
