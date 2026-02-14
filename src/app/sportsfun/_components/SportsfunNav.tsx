import Link from "next/link";

const NAV_ITEMS = [
  { href: "/sportsfun", label: "Overview" },
  { href: "/sportsfun/tokens", label: "Tokens" },
  { href: "/sportsfun/pools", label: "Pools" },
  { href: "/sportsfun/market", label: "Market flow" },
  { href: "/sportsfun/tracker", label: "Tracker" },
  { href: "/sportsfun/portfolio", label: "Portfolio" },
  { href: "/sportsfun/watchlist", label: "Watchlist" },
] as const;

export default function SportsfunNav() {
  return (
    <nav className="flex flex-wrap gap-2">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
