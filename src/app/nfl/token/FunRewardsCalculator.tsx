"use client";

import { useMemo, useState } from "react";
import { estimateFunRewards, type FunRewardTier } from "@/lib/funRewards";

function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

type Props = {
  tiers: FunRewardTier[];
};

export default function FunRewardsCalculator({ tiers }: Props) {
  const [balanceInput, setBalanceInput] = useState("");

  const parsedBalance = useMemo(() => {
    if (!balanceInput.trim()) return null;
    const parsed = Number(balanceInput);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
  }, [balanceInput]);

  const estimate = useMemo(() => {
    if (parsedBalance === null) return null;
    return estimateFunRewards(parsedBalance, tiers);
  }, [parsedBalance, tiers]);

  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-white/5">
      <h3 className="text-lg font-semibold text-black dark:text-white">$FUN rewards calculator</h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Enter your estimated balance to preview tier perks.
      </p>

      <label className="mt-4 block text-xs text-zinc-600 dark:text-zinc-400">
        $FUN balance
        <input
          type="number"
          min="0"
          step="any"
          value={balanceInput}
          onChange={(event) => setBalanceInput(event.target.value)}
          placeholder="0"
          className="mt-1 block w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
        />
      </label>

      {estimate ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-black/5 p-3 dark:bg-white/10">
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Holding score</div>
            <div className="mt-1 text-lg font-semibold text-black dark:text-white">
              {formatNumber(estimate.tier.holdingScore, 0)}
            </div>
          </div>
          <div className="rounded-lg bg-black/5 p-3 dark:bg-white/10">
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Weekly bonus TP</div>
            <div className="mt-1 text-lg font-semibold text-black dark:text-white">
              {formatNumber(estimate.tier.weeklyBonusTp, 0)}
            </div>
          </div>
          <div className="rounded-lg bg-black/5 p-3 dark:bg-white/10">
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Season multiplier</div>
            <div className="mt-1 text-lg font-semibold text-black dark:text-white">
              x{formatNumber(estimate.tier.seasonFunMultiplier, 2)}
            </div>
          </div>
          <div className="rounded-lg bg-black/5 p-3 dark:bg-white/10">
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">To next tier</div>
            <div className="mt-1 text-lg font-semibold text-black dark:text-white">
              {estimate.deltaToNext !== undefined ? formatNumber(estimate.deltaToNext, 0) : "Max tier"}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-lg bg-black/5 p-3 text-sm text-zinc-600 dark:bg-white/10 dark:text-zinc-400">
          Enter a valid non-negative number to see estimate.
        </div>
      )}

      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        Estimates are informational only and do not guarantee actual payouts.
      </p>
    </section>
  );
}
