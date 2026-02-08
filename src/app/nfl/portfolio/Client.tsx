"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import SportfunPortfolioDashboard from "@/components/portfolio/SportfunPortfolioDashboard";

const SAMPLE_WALLET = "0x82c117A68fD47A2d53b997049F4BE44714D57455";

type Props = {
  initialAddress?: string;
};

export default function NflPortfolioClient({ initialAddress }: Props) {
  const [address, setAddress] = useState(initialAddress ?? "");
  const trimmed = address.trim();
  const activeAddress = (initialAddress ?? "").trim();

  const sampleHref = useMemo(
    () => `/nfl/portfolio?address=${encodeURIComponent(SAMPLE_WALLET)}`,
    []
  );

  return (
    <div className="space-y-6">
      <form
        method="GET"
        action="/nfl/portfolio"
        className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5"
      >
        <div className="text-sm text-zinc-600 dark:text-zinc-400">Wallet address</div>
        <input
          name="address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="0x..."
          className="mt-2 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
        />

        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={!trimmed}
            className={`rounded-md px-4 py-2 text-sm ${
              trimmed
                ? "bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                : "cursor-not-allowed bg-zinc-200 text-zinc-500 dark:bg-white/10 dark:text-zinc-500"
            }`}
          >
            Open NFL portfolio
          </button>

          <Link
            href={sampleHref}
            className="rounded-md border border-black/10 px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
          >
            Open sample wallet
          </Link>
        </div>

        <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
          NFL mode locks sport filter to NFL and keeps all on-chain scan/export actions.
        </p>
      </form>

      {activeAddress ? (
        <div className="rounded-xl border border-black/10 bg-white/50 p-2 dark:border-white/10 dark:bg-white/5">
          <SportfunPortfolioDashboard
            address={activeAddress}
            mode="nfl"
            lockedSportFilter="nfl"
            showGlobalLinks={false}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-black/10 bg-white/40 p-4 text-sm text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
          Enter an address to render the embedded NFL portfolio dashboard.
        </div>
      )}
    </div>
  );
}
