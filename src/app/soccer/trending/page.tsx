import Link from "next/link";
import SoccerPageShell from "../_components/SoccerPageShell";
import { getSportfunMarketSnapshot, toUsdNumber } from "@/lib/sportfunMarket";

const SORT_OPTIONS = [
  { key: "volume", label: "24h volume" },
  { key: "change", label: "24h price change" },
  { key: "trades", label: "24h trades" },
] as const;

function parseNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function formatUsd(raw?: string): string {
  if (!raw) return "—";
  const value = toUsdNumber(raw);
  const abs = Math.abs(value);
  if (abs >= 1000) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (abs >= 1) return `$${value.toFixed(2)}`;
  if (abs >= 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(6)}`;
}

function formatPercent(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatShares(raw?: string, fractionDigits = 2): string {
  if (!raw) return "0";
  const neg = raw.startsWith("-");
  const abs = BigInt(neg ? raw.slice(1) : raw);
  const base = 10n ** 18n;
  const whole = abs / base;
  const fraction = abs % base;
  if (fractionDigits <= 0) return `${neg ? "-" : ""}${whole.toString()}`;
  const frac = fraction.toString().padStart(18, "0").slice(0, fractionDigits);
  return `${neg ? "-" : ""}${whole.toString()}.${frac}`;
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function buildQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export default async function SoccerTrendingPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; windowHours?: string }>;
}) {
  const params = await searchParams;
  const windowHours = parseNumber(params.windowHours, 24, 1, 168);
  const sort = SORT_OPTIONS.find((opt) => opt.key === params.sort)?.key ?? "volume";

  const snapshot = await getSportfunMarketSnapshot({
    sport: "soccer",
    windowHours,
    trendDays: 30,
    maxTokens: 200,
  });

  const sortedTokens = snapshot.tokens.slice().sort((a, b) => {
    if (sort === "change") return Math.abs(b.priceChange24hPercent ?? 0) - Math.abs(a.priceChange24hPercent ?? 0);
    if (sort === "trades") return (b.trades24h ?? 0) - (a.trades24h ?? 0);
    return Number(b.volume24hSharesRaw ?? 0) - Number(a.volume24hSharesRaw ?? 0);
  });

  return (
    <SoccerPageShell
      title="Soccer trending players"
      description="Trending Sport.fun soccer tokens based on 24h on-chain activity."
    >
      <section className="mt-6 flex flex-wrap gap-3">
        {[6, 12, 24, 48, 72].map((hours) => (
          <Link
            key={hours}
            className={`rounded-full border px-3 py-2 text-xs ${
              hours === windowHours
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/soccer/trending${buildQuery({ windowHours: String(hours), sort })}`}
          >
            {hours}h window
          </Link>
        ))}
      </section>

      <section className="mt-4 flex flex-wrap gap-3">
        {SORT_OPTIONS.map((opt) => (
          <Link
            key={opt.key}
            className={`rounded-full border px-3 py-2 text-xs ${
              opt.key === sort
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/soccer/trending${buildQuery({ windowHours: String(windowHours), sort: opt.key })}`}
          >
            {opt.label}
          </Link>
        ))}
      </section>

      <section className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        <p>Sorting by {SORT_OPTIONS.find((opt) => opt.key === sort)?.label}. Snapshot updated {formatDate(snapshot.asOf)}.</p>
      </section>

      <section className="mt-8">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Δ</th>
                <th className="px-3 py-2">Volume</th>
                <th className="px-3 py-2">Trades</th>
                <th className="px-3 py-2">Last trade</th>
              </tr>
            </thead>
            <tbody>
              {sortedTokens.slice(0, 50).map((row) => (
                <tr key={row.tokenIdDec} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.name ?? `#${row.tokenIdDec}`}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatUsd(row.currentPriceUsdcRaw)}</td>
                  <td
                    className={`px-3 py-2 ${
                      (row.priceChange24hPercent ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"
                    }`}
                  >
                    {formatPercent(row.priceChange24hPercent)}
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatShares(row.volume24hSharesRaw, 2)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.trades24h}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatDate(row.lastTradeAt)}</td>
                </tr>
              ))}
              {sortedTokens.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={6}>
                    No trades found for the selected window.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          How to use this page: trending is based on on-chain Sport.fun trades. Higher volume and faster price change usually
          means more attention.
        </p>
      </section>
    </SoccerPageShell>
  );
}
