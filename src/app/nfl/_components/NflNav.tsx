import Link from "next/link";

const NAV_ITEMS = [
  { href: "/nfl", label: "Market" },
  { href: "/soccer", label: "Switch to Soccer" },
  { href: "/nfl/players", label: "Players" },
  { href: "/nfl/teams", label: "Teams" },
  { href: "/nfl/standings", label: "Standings" },
  { href: "/nfl/alerts", label: "Alerts" },
  { href: "/nfl/portfolio", label: "Portfolio" },
  { href: "/nfl/token", label: "Token" },
  { href: "/nfl/trending", label: "Trending" },
  { href: "/nfl/signals", label: "Signals" },
  { href: "/nfl/analytics", label: "Analytics" },
  { href: "/nfl/advanced-stats", label: "Advanced stats" },
  { href: "/nfl/opportunities", label: "Opportunities" },
  { href: "/nfl/matchups", label: "Matchups" },
  { href: "/nfl/defensive-matchups", label: "Defensive matchups" },
  { href: "/nfl/tournament-summary", label: "Tournament summary" },
  { href: "/nfl/tournament-matrix", label: "Tournament matrix" },
] as const;

export default function NflNav() {
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
