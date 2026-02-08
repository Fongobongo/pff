import Image from "next/image";
import Link from "next/link";
import NflPageShell from "../_components/NflPageShell";
import {
  FUN_PAIR_ADDRESS,
  FUN_TOKEN_ADDRESS,
  formatUsdFromRaw,
  getFunTokenSnapshot,
} from "@/lib/funToken";
import { env } from "@/lib/env";
import { getFunRewardTiers } from "@/lib/funRewards";
import FunRewardsCalculator from "./FunRewardsCalculator";

export const dynamic = "force-dynamic";

function formatPercent(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export default async function NflTokenPage() {
  const snapshot = await getFunTokenSnapshot();
  const changePositive = (snapshot.priceChange24hPercent ?? 0) >= 0;
  const meta = snapshot.tokenMeta;
  const rewardTiers = getFunRewardTiers(env.FUN_REWARD_TIERS_JSON);

  return (
    <NflPageShell title="$FUN token" description="On-chain snapshot for the Sport.fun ecosystem token.">
      <section className="mt-6 flex items-center gap-4">
        {meta?.logoUrl ? (
          <Image
            src={meta.logoUrl}
            alt={meta.symbol ?? "$FUN"}
            width={48}
            height={48}
            className="h-12 w-12 rounded-full border border-black/10 object-cover dark:border-white/10"
            unoptimized
          />
        ) : null}
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Token</div>
          <div className="text-lg font-semibold text-black dark:text-white">
            {meta?.name ?? "$FUN"}
            {meta?.symbol ? ` (${meta.symbol})` : ""}
          </div>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Price</div>
              <div className="mt-2 text-4xl font-semibold text-black dark:text-white">
                {formatUsdFromRaw(snapshot.priceUsdcRaw)}
              </div>
            </div>
            <div
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                changePositive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
              }`}
            >
              {formatPercent(snapshot.priceChange24hPercent)}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">24h volume</div>
              <div className="mt-1 text-lg text-black dark:text-white">
                {formatUsdFromRaw(snapshot.volume24hUsdcRaw)}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Market cap</div>
              <div className="mt-1 text-lg text-black dark:text-white">
                {formatUsdFromRaw(snapshot.marketCapUsdcRaw)}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Liquidity</div>
              <div className="mt-1 text-lg text-black dark:text-white">
                {formatUsdFromRaw(snapshot.liquidityUsdcRaw)}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">FDV</div>
              <div className="mt-1 text-lg text-black dark:text-white">{formatUsdFromRaw(snapshot.fdvUsdcRaw)}</div>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="border-b border-black/10 px-4 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              Price chart
            </div>
            <div className="relative w-full" style={{ paddingBottom: "65%" }}>
              <iframe
                title="$FUN price chart"
                src={`https://dexscreener.com/base/${FUN_PAIR_ADDRESS}?embed=1&loadChartSettings=0&chartLeftToolbar=0&chartDefaultOnMobile=1&chartTheme=dark&theme=dark&chartStyle=0&chartType=usd&interval=15`}
                className="absolute inset-0 h-full w-full border-0"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Contract info</div>
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <div className="text-zinc-500 dark:text-zinc-400">Token contract</div>
              <code className="mt-1 block break-all rounded-md bg-black/5 p-2 text-xs text-black dark:bg-white/10 dark:text-white">
                {FUN_TOKEN_ADDRESS}
              </code>
            </div>
            <div>
              <div className="text-zinc-500 dark:text-zinc-400">DEX pair</div>
              <code className="mt-1 block break-all rounded-md bg-black/5 p-2 text-xs text-black dark:bg-white/10 dark:text-white">
                {FUN_PAIR_ADDRESS}
              </code>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`https://basescan.org/token/${FUN_TOKEN_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-black/10 px-3 py-2 text-xs text-black hover:bg-zinc-50 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
              >
                BaseScan token
              </Link>
              <Link
                href={`https://basescan.org/address/${FUN_PAIR_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-black/10 px-3 py-2 text-xs text-black hover:bg-zinc-50 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
              >
                BaseScan pair
              </Link>
            </div>
          </div>

          <div className="mt-6 rounded-lg bg-black/5 p-4 text-xs text-zinc-600 dark:bg-white/10 dark:text-zinc-400">
            Snapshot updated {new Date(snapshot.asOf).toLocaleString()} · On-chain data via Alchemy.
          </div>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-white/5">
          <h3 className="text-lg font-semibold text-black dark:text-white">FUN holding score tiers</h3>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Weekly rewards and season multipliers scale with long-term $FUN balance.
          </p>

          <div className="mt-4 overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Min $FUN</th>
                  <th className="px-3 py-2">Holding score</th>
                  <th className="px-3 py-2">Weekly bonus TP</th>
                  <th className="px-3 py-2">Season multiplier</th>
                </tr>
              </thead>
              <tbody>
                {rewardTiers.map((tier) => (
                  <tr key={tier.minBalance} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                      {tier.minBalance.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{tier.holdingScore}</td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{tier.weeklyBonusTp}</td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">x{tier.seasonFunMultiplier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-white/5">
          <h3 className="text-lg font-semibold text-black dark:text-white">Weekly seasons reward flow</h3>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Reference flow for estimating how your balance tier can affect rewards.
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
            <li>Weekly tier is derived from current $FUN balance snapshot.</li>
            <li>Holding score and weekly bonus TP are applied for the selected tier.</li>
            <li>Season rewards apply the configured FUN multiplier for that tier.</li>
            <li>Final emissions can vary based on live protocol rules and eligibility checks.</li>
          </ol>
          <div className="mt-4 rounded-lg bg-black/5 p-3 text-xs text-zinc-600 dark:bg-white/10 dark:text-zinc-400">
            This section is informational and not financial advice.
          </div>
        </div>
      </section>

      <section className="mt-6">
        <FunRewardsCalculator tiers={rewardTiers} />
      </section>
    </NflPageShell>
  );
}
