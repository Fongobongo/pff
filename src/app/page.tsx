import Link from "next/link";

const SAMPLE_WALLET = "0x82c117A68fD47A2d53b997049F4BE44714D57455";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto max-w-3xl p-6">
        <header className="mt-10">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            pff — Sport.fun fan analytics (WIP)
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Base wallet analytics + Sport.fun in-game portfolio reconstruction.
          </p>
        </header>

        <section className="mt-10 grid grid-cols-1 gap-4">
          <Link
            className="rounded-xl border border-black/10 bg-white p-4 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            href={`/base/${SAMPLE_WALLET}`}
          >
            <div className="text-sm text-zinc-600 dark:text-zinc-400">Base wallet dashboard</div>
            <div className="mt-1 text-lg font-medium text-black dark:text-white">{SAMPLE_WALLET}</div>
          </Link>

          <Link
            className="rounded-xl border border-black/10 bg-white p-4 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            href={`/sportfun/portfolio/${SAMPLE_WALLET}`}
          >
            <div className="text-sm text-zinc-600 dark:text-zinc-400">Sport.fun portfolio (WIP)</div>
            <div className="mt-1 text-lg font-medium text-black dark:text-white">{SAMPLE_WALLET}</div>
          </Link>

          <Link
            className="rounded-xl border border-black/10 bg-white p-4 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            href="/football"
          >
            <div className="text-sm text-zinc-600 dark:text-zinc-400">Football stats (StatsBomb)</div>
            <div className="mt-1 text-lg font-medium text-black dark:text-white">Competitions</div>
          </Link>

          <Link
            className="rounded-xl border border-black/10 bg-white p-4 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            href="/nfl"
          >
            <div className="text-sm text-zinc-600 dark:text-zinc-400">NFL weekly scoring</div>
            <div className="mt-1 text-lg font-medium text-black dark:text-white">nflverse stats</div>
          </Link>
        </section>

        <section className="mt-10 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-sm text-zinc-600 dark:text-zinc-400">Notes</div>
          <ul className="mt-2 list-disc pl-5 text-sm text-zinc-600 dark:text-zinc-400">
            <li>
              Sport.fun APIs are Cloudflare-blocked; we reconstruct holdings from on-chain ERC-1155 transfers.
            </li>
            <li>
              Next step: correlate ERC-1155 transfers with USDC flows to infer buy/sell prices.
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
