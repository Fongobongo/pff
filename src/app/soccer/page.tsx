import Link from "next/link";
import SoccerPageShell from "./_components/SoccerPageShell";
import { getSportfunMarketSnapshot, toUsdNumber } from "@/lib/sportfunMarket";

const TREND_OPTIONS = [7, 30, 90, 180];
const WINDOW_OPTIONS = [24, 72, 168];

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

export default async function SoccerMarketPage({
  searchParams,
}: {
  searchParams: Promise<{ trendDays?: string; windowHours?: string }>;
}) {
  const params = await searchParams;
  const trendDays = parseNumber(params.trendDays, 30, 7, 365);
  const windowHours = parseNumber(params.windowHours, 24, 1, 168);

  const snapshot = await getSportfunMarketSnapshot({
    sport: "soccer",
    trendDays,
    windowHours,
    maxTokens: 250,
  });

  const movers = snapshot.tokens
    .filter((t) => t.priceChange24hPercent !== undefined)
    .slice()
    .sort((a, b) =>
      Math.abs(b.priceChange24hPercent ?? 0) - Math.abs(a.priceChange24hPercent ?? 0)
    )
    .slice(0, 10);

  const gainers = snapshot.tokens
    .filter((t) => (t.priceChange24hPercent ?? 0) > 0)
    .slice()
    .sort((a, b) => (b.priceChange24hPercent ?? 0) - (a.priceChange24hPercent ?? 0))
    .slice(0, 10);

  const losers = snapshot.tokens
    .filter((t) => (t.priceChange24hPercent ?? 0) < 0)
    .slice()
    .sort((a, b) => (a.priceChange24hPercent ?? 0) - (b.priceChange24hPercent ?? 0))
    .slice(0, 10);

  const trend = snapshot.trend;
  const pricePoints = trend
    .filter((p) => p.avgPriceUsdcRaw)
    .map((p) => ({ ts: p.ts, price: BigInt(p.avgPriceUsdcRaw ?? "0") }));

  const volumePoints = trend.map((p) => ({ ts: p.ts, volume: BigInt(p.volumeSharesRaw ?? "0") }));
  const hasTrend = trend.length > 1 && pricePoints.length > 1;

  const minPrice = pricePoints.length ? pricePoints.reduce((a, b) => (a.price < b.price ? a : b)).price : 0n;
  const maxPrice = pricePoints.length ? pricePoints.reduce((a, b) => (a.price > b.price ? a : b)).price : 0n;
  const priceRange = maxPrice > minPrice ? maxPrice - minPrice : 1n;

  const maxVolume = volumePoints.length
    ? volumePoints.reduce((a, b) => (a.volume > b.volume ? a : b)).volume
    : 1n;

  const chartWidth = 640;
  const chartHeight = 180;
  const padX = 36;
  const padY = 24;

  const trendPath = hasTrend
    ? pricePoints
        .map((point, idx) => {
          const x = padX + (idx / (pricePoints.length - 1)) * (chartWidth - padX * 2);
          const y =
            padY +
            (chartHeight - padY * 2) * (1 - Number(point.price - minPrice) / Number(priceRange));
          return `${idx === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(" ")
    : "";

  const volumeScale = (value: bigint) =>
    (Number(value) / Math.max(1, Number(maxVolume))) * (chartHeight - padY * 2);

  const maxDistribution = Math.max(1, ...snapshot.distribution.map((d) => d.count));

  return (
    <SoccerPageShell title="Soccer Market Overview" description="Sport.fun on-chain market snapshot and price activity.">
      <section className="mt-6 flex flex-wrap gap-3">
        {WINDOW_OPTIONS.map((hours) => (
          <Link
            key={hours}
            className={`rounded-full border px-3 py-2 text-xs ${
              hours === windowHours
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/soccer${buildQuery({ windowHours: String(hours), trendDays: String(trendDays) })}`}
          >
            {hours}h window
          </Link>
        ))}
      </section>

      <section className="mt-4 flex flex-wrap gap-3">
        {TREND_OPTIONS.map((days) => (
          <Link
            key={days}
            className={`rounded-full border px-3 py-2 text-xs ${
              days === trendDays
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/soccer${buildQuery({ windowHours: String(windowHours), trendDays: String(days) })}`}
          >
            {days}d trend
          </Link>
        ))}
      </section>

      <section className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        <p>Snapshot updated {formatDate(snapshot.asOf)}.</p>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total tokens</div>
          <div className="mt-2 text-2xl font-semibold text-black dark:text-white">{snapshot.summary.totalTokens}</div>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Active (24h)</div>
          <div className="mt-2 text-2xl font-semibold text-black dark:text-white">{snapshot.summary.activeTokens24h}</div>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Trades (24h)</div>
          <div className="mt-2 text-2xl font-semibold text-black dark:text-white">{snapshot.summary.trades24h}</div>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Shares volume (24h)</div>
          <div className="mt-2 text-2xl font-semibold text-black dark:text-white">
            {formatShares(snapshot.summary.volume24hSharesRaw, 2)}
          </div>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Top price movers ({windowHours}h)
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Δ</th>
                <th className="px-3 py-2">Volume</th>
              </tr>
            </thead>
            <tbody>
              {movers.map((row) => (
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
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {formatShares(row.volume24hSharesRaw, 2)}
                  </td>
                </tr>
              ))}
              {movers.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={4}>
                    No trades in the selected window.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Price distribution
          </div>
          <div className="space-y-3 p-4 text-sm">
            {snapshot.distribution.map((bin) => (
              <div key={bin.label} className="flex items-center gap-3">
                <div className="w-24 text-zinc-600 dark:text-zinc-400">{bin.label}</div>
                <div className="flex-1 rounded-full bg-zinc-100 dark:bg-white/10">
                  <div
                    className="h-2 rounded-full bg-black/70 dark:bg-white/70"
                    style={{ width: `${(bin.count / maxDistribution) * 100}%` }}
                  />
                </div>
                <div className="w-10 text-right text-zinc-600 dark:text-zinc-400">{bin.count}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Price trends</div>
              <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Avg price + volume over the last {trendDays} days.
              </div>
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">{trend.length} points</div>
          </div>
          <div className="mt-4 overflow-x-auto">
            {hasTrend ? (
              <svg className="w-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Price trend">
                <rect x={0} y={0} width={chartWidth} height={chartHeight} fill="transparent" />
                <line x1={padX} y1={padY} x2={padX} y2={chartHeight - padY} stroke="rgba(0,0,0,0.15)" strokeWidth="1" />
                <line
                  x1={padX}
                  y1={chartHeight - padY}
                  x2={chartWidth - padX}
                  y2={chartHeight - padY}
                  stroke="rgba(0,0,0,0.15)"
                  strokeWidth="1"
                />
                {volumePoints.map((point, idx) => {
                  const x = padX + (idx / (volumePoints.length - 1)) * (chartWidth - padX * 2);
                  const height = volumeScale(point.volume);
                  return (
                    <rect
                      key={`v-${point.ts}`}
                      x={x - 3}
                      y={chartHeight - padY - height}
                      width={6}
                      height={height}
                      fill="rgba(59,130,246,0.35)"
                    />
                  );
                })}
                {trendPath ? <path d={trendPath} fill="none" stroke="#111827" strokeWidth="2" /> : null}
              </svg>
            ) : (
              <div className="text-sm text-zinc-600 dark:text-zinc-400">Not enough data for a trend chart.</div>
            )}
          </div>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Top gainers ({windowHours}h)
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Δ</th>
              </tr>
            </thead>
            <tbody>
              {gainers.map((row) => (
                <tr key={row.tokenIdDec} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.name ?? `#${row.tokenIdDec}`}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatUsd(row.currentPriceUsdcRaw)}</td>
                  <td className="px-3 py-2 text-emerald-500">{formatPercent(row.priceChange24hPercent)}</td>
                </tr>
              ))}
              {gainers.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={3}>
                    No gainers in the window.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Top losers ({windowHours}h)
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Δ</th>
              </tr>
            </thead>
            <tbody>
              {losers.map((row) => (
                <tr key={row.tokenIdDec} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.name ?? `#${row.tokenIdDec}`}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatUsd(row.currentPriceUsdcRaw)}</td>
                  <td className="px-3 py-2 text-rose-500">{formatPercent(row.priceChange24hPercent)}</td>
                </tr>
              ))}
              {losers.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={3}>
                    No losers in the window.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Market summary</div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Avg price</div>
              <div className="mt-1 text-lg text-black dark:text-white">{formatUsd(snapshot.summary.priceAvgUsdcRaw)}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Median price</div>
              <div className="mt-1 text-lg text-black dark:text-white">{formatUsd(snapshot.summary.priceMedianUsdcRaw)}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Min price</div>
              <div className="mt-1 text-lg text-black dark:text-white">{formatUsd(snapshot.summary.priceMinUsdcRaw)}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Max price</div>
              <div className="mt-1 text-lg text-black dark:text-white">{formatUsd(snapshot.summary.priceMaxUsdcRaw)}</div>
            </div>
          </div>
        </div>
      </section>
    </SoccerPageShell>
  );
}
