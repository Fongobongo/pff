"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const SAMPLE_WALLET = "0x82c117A68fD47A2d53b997049F4BE44714D57455";

export default function NflPortfolioClient() {
  const [address, setAddress] = useState("");
  const trimmed = address.trim();
  const href = useMemo(() => (trimmed ? `/sportfun/portfolio/${trimmed}` : ""), [trimmed]);

  return (
    <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
      <div className="text-sm text-zinc-600 dark:text-zinc-400">Wallet address</div>
      <input
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        placeholder="0x..."
        className="mt-2 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
      />
      <div className="mt-3 flex flex-wrap gap-3">
        <Link
          href={href || "#"}
          aria-disabled={!trimmed}
          className={`rounded-md px-4 py-2 text-sm ${
            trimmed
              ? "bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              : "cursor-not-allowed bg-zinc-200 text-zinc-500 dark:bg-white/10 dark:text-zinc-500"
          }`}
        >
          View portfolio
        </Link>
        <Link
          href={`/sportfun/portfolio/${SAMPLE_WALLET}`}
          className="rounded-md border border-black/10 px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
        >
          Open sample wallet
        </Link>
      </div>
      <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
        This opens the on-chain Sport.fun portfolio reconstruction (includes NFL + soccer tokens).
      </p>
    </div>
  );
}
