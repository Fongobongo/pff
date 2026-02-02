import Link from "next/link";
import { FOOTBALL_DATA_BASE_TIER, getTierOverrides } from "@/lib/footballTier";
import FootballTierEditor from "./Client";

export default async function FootballTiersPage() {
  const overrides = getTierOverrides();

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto max-w-4xl p-6">
        <header className="mt-10">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Competition tier mapping
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            football-data.org competition codes mapped to Sport.fun tiers.
          </p>
        </header>

        <section className="mt-6">
          <Link
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            href="/football"
          >
            Back to football stats
          </Link>
        </section>

        <section className="mt-8">
          <FootballTierEditor base={FOOTBALL_DATA_BASE_TIER} overrides={overrides} />
        </section>
      </main>
    </div>
  );
}
