import Link from "next/link";
import SportsfunPageShell from "../_components/SportsfunPageShell";
import { formatCompactNumber, formatDateTime, formatSignedUsd } from "../_components/format";
import {
  getSportsfunTrackedWallets,
  getSportsfunWalletRemarks,
  getSportsfunWalletTrades,
  getSportsfunWalletTradeStats,
} from "@/lib/teneroSportsfun";
import { shortenAddress } from "@/lib/format";

const SAMPLE_WALLETS = [
  "0x82c117A68fD47A2d53b997049F4BE44714D57455",
  "0x8DC5132271E61922f68B50590071FA30155b41c0",
];

type TradeFeedRow = {
  wallet: string;
  eventType: string;
  amountUsd: number;
  poolId: string;
  txId: string;
  blockTime: number;
};

function parseWallets(raw: string | undefined): string[] {
  if (!raw) return SAMPLE_WALLETS;
  const items = raw
    .split(/[,\n\r\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(items)].slice(0, 8);
}

function isEvmAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function extractWalletsFromUnknown(value: unknown): string[] {
  const out = new Set<string>();
  const records: unknown[] = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { rows?: unknown[] }).rows)
      ? ((value as { rows?: unknown[] }).rows ?? [])
      : [];

  for (const entry of records) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const wallet =
      (typeof record.wallet === "string" && record.wallet) ||
      (typeof record.address === "string" && record.address) ||
      (typeof record.wallet_address === "string" && record.wallet_address) ||
      "";
    if (wallet && isEvmAddress(wallet)) out.add(wallet);
  }
  return [...out];
}

function countRemarksFromUnknown(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object" && Array.isArray((value as { rows?: unknown[] }).rows)) {
    return (value as { rows?: unknown[] }).rows?.length ?? 0;
  }
  return 0;
}

export default async function SportsfunTrackerPage({
  searchParams,
}: {
  searchParams: Promise<{ wallets?: string; group?: string }>;
}) {
  const params = await searchParams;
  const group = params.group?.trim() || "default";
  const walletsRaw = params.wallets?.trim() || SAMPLE_WALLETS.join(",");
  const manualWallets = parseWallets(walletsRaw).filter((wallet) => isEvmAddress(wallet));

  let loadError: string | null = null;
  let authGateInfo = {
    trackedAuthRequired: false,
    remarksAuthRequired: false,
  };

  let trackedWallets: string[] = [];
  let remarkCount = 0;
  let walletStats: Array<{
    wallet: string;
    trades7d: number;
    netflow7d: number;
  }> = [];
  let feed: TradeFeedRow[] = [];

  try {
    const [trackedWalletsResult, walletRemarksResult] = await Promise.all([
      getSportsfunTrackedWallets(),
      getSportsfunWalletRemarks(),
    ]);

    authGateInfo = {
      trackedAuthRequired: trackedWalletsResult.authRequired,
      remarksAuthRequired: walletRemarksResult.authRequired,
    };

    trackedWallets = extractWalletsFromUnknown(trackedWalletsResult.data);
    remarkCount = countRemarksFromUnknown(walletRemarksResult.data);

    const selectedWallets = manualWallets.length > 0 ? manualWallets : trackedWallets.slice(0, 8);

    const [statsRows, feedRows] = await Promise.all([
      Promise.all(
        selectedWallets.map(async (wallet) => {
          const stats = await getSportsfunWalletTradeStats(wallet, "7d");
          return {
            wallet,
            trades7d: stats.total_trades,
            netflow7d: stats.trade_netflow_usd,
          };
        })
      ),
      Promise.all(
        selectedWallets.map(async (wallet) => {
          const page = await getSportsfunWalletTrades(wallet, { limit: 15 });
          return page.rows.map((row) => ({
            wallet,
            eventType: row.event_type,
            amountUsd: row.amount_usd,
            poolId: row.pool_id,
            txId: row.tx_id,
            blockTime: row.block_time,
          }));
        })
      ),
    ]);

    walletStats = statsRows;
    feed = feedRows.flat().sort((a, b) => b.blockTime - a.blockTime).slice(0, 120);
  } catch (error: unknown) {
    loadError = describeError(error);
  }

  const totalTrades7d = walletStats.reduce((acc, row) => acc + row.trades7d, 0);
  const totalNetflow7d = walletStats.reduce((acc, row) => acc + row.netflow7d, 0);

  return (
    <SportsfunPageShell
      title="sports.fun Tracker"
      description="Tracked wallets, wallet groups, remarks visibility, and grouped trade feed."
    >
      <section className="mt-6 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
        <form method="get" className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input
            name="group"
            defaultValue={group}
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-black dark:text-white"
            placeholder="Group label (e.g. whales)"
          />
          <input
            name="wallets"
            defaultValue={walletsRaw}
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-black dark:text-white"
            placeholder="Comma-separated wallets"
          />
          <div className="md:col-span-2">
            <button
              type="submit"
              className="rounded-lg border border-black bg-black px-4 py-2 text-sm text-white hover:bg-zinc-800 dark:border-white dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Refresh tracker
            </button>
          </div>
        </form>
      </section>

      {loadError ? (
        <section className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          Failed to load tracker data: {loadError}
        </section>
      ) : null}

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Group</div>
          <div className="mt-2 text-xl font-semibold text-black dark:text-white">{group}</div>
        </article>
        <article className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Wallets tracked (active)</div>
          <div className="mt-2 text-2xl font-semibold text-black dark:text-white">{walletStats.length}</div>
        </article>
        <article className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Trade count (7d)</div>
          <div className="mt-2 text-2xl font-semibold text-black dark:text-white">{formatCompactNumber(totalTrades7d)}</div>
        </article>
        <article className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Netflow (7d)</div>
          <div
            className={`mt-2 text-2xl font-semibold ${
              totalNetflow7d >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"
            }`}
          >
            {formatSignedUsd(totalNetflow7d)}
          </div>
        </article>
      </section>

      <section className="mt-6 rounded-xl border border-black/10 bg-white p-4 text-sm dark:border-white/10 dark:bg-white/5">
        <div className="font-medium text-black dark:text-white">Auth-gated parity status</div>
        <ul className="mt-2 space-y-1 text-zinc-600 dark:text-zinc-400">
          <li>
            `tracked_wallets`:{" "}
            <span className={authGateInfo.trackedAuthRequired ? "text-amber-600 dark:text-amber-300" : "text-emerald-600 dark:text-emerald-300"}>
              {authGateInfo.trackedAuthRequired ? "auth required (401)" : "available"}
            </span>
          </li>
          <li>
            `wallet_remarks`:{" "}
            <span className={authGateInfo.remarksAuthRequired ? "text-amber-600 dark:text-amber-300" : "text-emerald-600 dark:text-emerald-300"}>
              {authGateInfo.remarksAuthRequired ? "auth required (401)" : `${remarkCount} remarks loaded`}
            </span>
          </li>
          <li>Fallback mode: manual wallet group via query form is active.</li>
        </ul>
      </section>

      <section className="mt-8 overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
        <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
          Wallet group stats
        </div>
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">Wallet</th>
              <th className="px-3 py-2 text-right">Trades 7d</th>
              <th className="px-3 py-2 text-right">Netflow 7d</th>
            </tr>
          </thead>
          <tbody>
            {walletStats.map((row) => (
              <tr key={row.wallet} className="border-t border-black/10 dark:border-white/10">
                <td className="px-3 py-2">
                  <Link className="text-blue-600 hover:underline dark:text-blue-300" href={`/sportsfun/wallet/${row.wallet}`}>
                    {shortenAddress(row.wallet)}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatCompactNumber(row.trades7d)}</td>
                <td
                  className={`px-3 py-2 text-right ${
                    row.netflow7d >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"
                  }`}
                >
                  {formatSignedUsd(row.netflow7d)}
                </td>
              </tr>
            ))}
            {walletStats.length === 0 ? (
              <tr>
                <td className="px-3 py-5 text-zinc-500 dark:text-zinc-400" colSpan={3}>
                  No wallet stats available.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="mt-8 overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
        <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
          Grouped trade feed
        </div>
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Wallet</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2 text-right">Amount USD</th>
              <th className="px-3 py-2">Pool</th>
            </tr>
          </thead>
          <tbody>
            {feed.map((row) => (
              <tr key={`${row.wallet}-${row.txId}-${row.poolId}`} className="border-t border-black/10 dark:border-white/10">
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatDateTime(row.blockTime)}</td>
                <td className="px-3 py-2">
                  <Link className="text-blue-600 hover:underline dark:text-blue-300" href={`/sportsfun/wallet/${row.wallet}`}>
                    {shortenAddress(row.wallet)}
                  </Link>
                </td>
                <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{row.eventType}</td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatSignedUsd(row.amountUsd)}</td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.poolId}</td>
              </tr>
            ))}
            {feed.length === 0 ? (
              <tr>
                <td className="px-3 py-5 text-zinc-500 dark:text-zinc-400" colSpan={5}>
                  No feed events loaded.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </SportsfunPageShell>
  );
}
