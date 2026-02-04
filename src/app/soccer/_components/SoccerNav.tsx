import Link from "next/link";

const NAV_ITEMS = [
  { href: "/soccer", label: "Market" },
  { href: "/soccer/players", label: "Players" },
  { href: "/soccer/trending", label: "Trending" },
  { href: "/soccer/advanced-stats", label: "Advanced stats" },
  { href: "/soccer/opportunities", label: "Opportunities" },
  { href: "/soccer/analytics", label: "Analytics" },
  { href: "/soccer/teams", label: "Teams" },
  { href: "/soccer/standings", label: "Standings" },
  { href: "/soccer/matches", label: "Matches" },
  { href: "/soccer/fixture-difficulty", label: "Fixture difficulty" },
  { href: "/soccer/tournament-summary", label: "Tournament summary" },
  { href: "/soccer/tournament-matrix", label: "Tournament matrix" },
  { href: "/soccer/token", label: "Token" },
  { href: "/soccer/portfolio", label: "Portfolio" },
] as const;

export default function SoccerNav() {
  return (
    <nav className="flex flex-wrap gap-2">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
          href={item.href}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
