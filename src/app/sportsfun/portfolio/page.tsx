import Link from "next/link";
import SportsfunPageShell from "../_components/SportsfunPageShell";
import { formatCompactNumber, formatSignedUsd, formatUsd } from "../_components/format";
import {
  getSportsfunWallet,
  getSportsfunWalletHoldingsValue,
  getSportsfunWalletTradeStats,
} from "@/lib/teneroSportsfun";
import { shortenAddress } from "@/lib/format";

const SAMPLE_WALLET = "0x82c117A68fD47A2d53b997049F4BE44714D57455";

function parseWallets(raw: string | undefined): string[] {
  if (!raw) return [SAMPLE_WALLET];
  const list = raw
    .split(/[,\n\r\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const deduped = [...new Set(list)];
  return deduped.slice(0, 12);
}

function isEvmAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

export default async function SportsfunPortfolioCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ wallets?: string }>;
}) {
  const params = await searchParams;
  const walletsRaw = params.wallets?.trim() ?? SAMPLE_WALLET;
  const walletCandidates = parseWallets(walletsRaw);
  const validWallets = walletCandidates.filter((wallet) => isEvmAddress(wallet));

  let loadError: string | null = null;
  let walletRows: Array<{
    address: string;
    name: string | null;
    totalValueUsd: number;
    tokenCount: number;
    totalTrades30d: number;
    tradeNetflow30d: number;
  }> = [];

  try {
    walletRows = await Promise.all(
      validWallets.map(async (address) => {
        const [wallet, holdingsValue, tradeStats] = await Promise.all([
          getSportsfunWallet(address),
          getSportsfunWalletHoldingsValue(address),
          getSportsfunWalletTradeStats(address, "30d"),
        ]);
        return {
          address,
          name: wallet.name,
          totalValueUsd: holdingsValue.total_value_usd,
          tokenCount: holdingsValue.token_count,
          totalTrades30d: tradeStats.total_trades,
          tradeNetflow30d: tradeStats.trade_netflow_usd,
        };
      })
    );
  } catch (error: unknown) {
    loadError = describeError(error);
  }

  const totalPortfolioValue = walletRows.reduce((acc, row) => acc + row.totalValueUsd, 0);
  const totalTokenCount = walletRows.reduce((acc, row) => acc + row.tokenCount, 0);
  const totalTrades = walletRows.reduce((acc, row) => acc + row.totalTrades30d, 0);
  const totalTradeNetflow = walletRows.reduce((acc, row) => acc + row.tradeNetflow30d, 0);

  return (
    <SportsfunPageShell
      title="sports.fun Portfolio Center"
      description="Manage multiple wallets and view aggregated portfolio analytics."
    >
      <section className="mt-6 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
        <form method="get" className="space-y-3">
          <label className="block text-sm font-medium text-black dark:text-white" htmlFor="portfolio-wallets">
            Wallets (comma-separated)
          </label>
          <textarea
            id="portfolio-wallets"
            name="wallets"
            defaultValue={walletsRaw}
            placeholder={SAMPLE_WALLET}
            className="min-h-24 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-black dark:text-white dark:placeholder:text-zinc-500"
          />
          <button
            type="submit"
            className="rounded-lg border border-black bg-black px-4 py-2 text-sm text-white hover:bg-zinc-800 dark:border-white dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Refresh portfolio
          </button>
        </form>
      </section>

      {loadError ? (
        <section className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          Failed to load portfolio analytics: {loadError}
        </section>
      ) : null}

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Wallets</div>
          <div className="mt-2 text-2xl font-semibold text-black dark:text-white">{walletRows.length}</div>
        </article>
        <article className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total value</div>
          <div className="mt-2 text-2xl font-semibold text-black dark:text-white">{formatUsd(totalPortfolioValue)}</div>
        </article>
        <article className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Token holdings</div>
          <div className="mt-2 text-2xl font-semibold text-black dark:text-white">{formatCompactNumber(totalTokenCount)}</div>
        </article>
        <article className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Trade netflow (30d)</div>
          <div
            className={`mt-2 text-2xl font-semibold ${
              totalTradeNetflow >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"
            }`}
          >
            {formatSignedUsd(totalTradeNetflow)}
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">Trades: {formatCompactNumber(totalTrades)}</div>
        </article>
      </section>

      <section className="mt-8 overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
        <table className="w-full min-w-[940px] text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">Wallet</th>
              <th className="px-3 py-2 text-right">Value</th>
              <th className="px-3 py-2 text-right">Tokens</th>
              <th className="px-3 py-2 text-right">Trades (30d)</th>
              <th className="px-3 py-2 text-right">Netflow (30d)</th>
            </tr>
          </thead>
          <tbody>
            {walletRows.map((row) => (
              <tr key={row.address} className="border-t border-black/10 dark:border-white/10">
                <td className="px-3 py-2">
                  <div className="font-medium text-black dark:text-white">{row.name || shortenAddress(row.address)}</div>
                  <Link className="text-xs text-blue-600 hover:underline dark:text-blue-300" href={`/sportsfun/wallet/${row.address}`}>
                    {row.address}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatUsd(row.totalValueUsd)}</td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatCompactNumber(row.tokenCount)}</td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatCompactNumber(row.totalTrades30d)}</td>
                <td
                  className={`px-3 py-2 text-right ${
                    row.tradeNetflow30d >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"
                  }`}
                >
                  {formatSignedUsd(row.tradeNetflow30d)}
                </td>
              </tr>
            ))}
            {walletRows.length === 0 ? (
              <tr>
                <td className="px-3 py-5 text-zinc-500 dark:text-zinc-400" colSpan={5}>
                  No valid wallet rows to display.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </SportsfunPageShell>
  );
}
