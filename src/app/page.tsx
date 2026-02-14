import Link from "next/link";

const SAMPLE_WALLET = "0x82c117A68fD47A2d53b997049F4BE44714D57455";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-100 dark:bg-[#0b1020]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-28 top-24 h-80 w-80 rounded-full bg-cyan-400/20 blur-[120px] dark:bg-cyan-500/20" />
        <div className="absolute -right-20 top-40 h-72 w-72 rounded-full bg-emerald-400/20 blur-[120px] dark:bg-emerald-500/20" />
        <div className="absolute bottom-8 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-indigo-400/20 blur-[140px] dark:bg-indigo-500/20" />
      </div>

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-14 pt-14">
        <section className="text-center">
          <h1 className="text-4xl font-black tracking-tight text-zinc-900 dark:text-white md:text-6xl">
            FunStats Dashboard
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-zinc-600 dark:text-zinc-300 md:text-base">
            Real-time fan analytics for sport.fun markets: pricing, portfolio reconstruction, and signal surfaces for
            NFL and Soccer.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-full border border-zinc-300 bg-white/80 px-3 py-1 text-xs text-zinc-600 dark:border-white/15 dark:bg-white/5 dark:text-zinc-300">
              Live prices
            </span>
            <span className="rounded-full border border-zinc-300 bg-white/80 px-3 py-1 text-xs text-zinc-600 dark:border-white/15 dark:bg-white/5 dark:text-zinc-300">
              Market trends
            </span>
            <span className="rounded-full border border-zinc-300 bg-white/80 px-3 py-1 text-xs text-zinc-600 dark:border-white/15 dark:bg-white/5 dark:text-zinc-300">
              Portfolio diagnostics
            </span>
            <span className="rounded-full border border-zinc-300 bg-white/80 px-3 py-1 text-xs text-zinc-600 dark:border-white/15 dark:bg-white/5 dark:text-zinc-300">
              Wallet analytics
            </span>
          </div>
        </section>

        <section className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2">
          <Link
            href="/nfl"
            className="group rounded-3xl border border-cyan-300/60 bg-white/85 p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-cyan-400 dark:border-cyan-500/30 dark:bg-zinc-900/65 dark:hover:border-cyan-400"
          >
            <div className="text-xs uppercase tracking-wide text-cyan-700 dark:text-cyan-300">Primary market</div>
            <h2 className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">NFL.Fun</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              On-chain player market, trend boards, pricing tables, and scoring overlays.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-2 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200">
                Weekly scores
              </div>
              <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-2 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200">
                Tournament matrix
              </div>
              <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-2 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200">
                Team economics
              </div>
              <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-2 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200">
                Market alerts
              </div>
            </div>
            <div className="mt-5 text-sm font-semibold text-cyan-700 transition-colors group-hover:text-cyan-600 dark:text-cyan-300 dark:group-hover:text-cyan-200">
              Enter dashboard
            </div>
          </Link>

          <Link
            href="/soccer"
            className="group rounded-3xl border border-emerald-300/60 bg-white/85 p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-emerald-400 dark:border-emerald-500/30 dark:bg-zinc-900/65 dark:hover:border-emerald-400"
          >
            <div className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Primary market</div>
            <h2 className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">Football.Fun</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Soccer market view with player directory, trending signals, and match-based analytics.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                Player directory
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                Advanced stats
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                Tournament summary
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                Fixture difficulty
              </div>
            </div>
            <div className="mt-5 text-sm font-semibold text-emerald-700 transition-colors group-hover:text-emerald-600 dark:text-emerald-300 dark:group-hover:text-emerald-200">
              Enter dashboard
            </div>
          </Link>
        </section>

        <section className="mt-10">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">Quick tools</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Link
              className="rounded-xl border border-black/10 bg-white/90 p-4 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              href={`/base/${SAMPLE_WALLET}`}
            >
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Base wallet</div>
              <div className="mt-2 text-sm font-semibold text-zinc-900 dark:text-white">Wallet dashboard</div>
              <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{SAMPLE_WALLET}</div>
            </Link>
            <Link
              className="rounded-xl border border-black/10 bg-white/90 p-4 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              href={`/sportfun/portfolio/${SAMPLE_WALLET}`}
            >
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Sport.fun</div>
              <div className="mt-2 text-sm font-semibold text-zinc-900 dark:text-white">Portfolio reconstruction</div>
              <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{SAMPLE_WALLET}</div>
            </Link>
            <Link
              className="rounded-xl border border-black/10 bg-white/90 p-4 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              href="/sportfun/prices"
            >
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Price store</div>
              <div className="mt-2 text-sm font-semibold text-zinc-900 dark:text-white">Supabase price feed</div>
              <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Manual refresh endpoint included</div>
            </Link>
            <Link
              className="rounded-xl border border-black/10 bg-white/90 p-4 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              href="/football"
            >
              <div className="text-xs text-zinc-500 dark:text-zinc-400">StatsBomb</div>
              <div className="mt-2 text-sm font-semibold text-zinc-900 dark:text-white">Competition explorer</div>
              <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Fixtures, standings, score models</div>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
