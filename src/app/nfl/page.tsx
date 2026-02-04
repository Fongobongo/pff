import Link from "next/link";
import NflPageShell from "./_components/NflPageShell";
import { getSportfunMarketSnapshot, toUsdNumber } from "@/lib/sportfunMarket";

const TREND_OPTIONS = [7, 30, 90, 180];
const WINDOW_OPTIONS = [24, 72, 168];
const SERIES_OPTIONS = [
  { key: "all", label: "All" },
  { key: "gainers", label: "Gainers" },
  { key: "losers", label: "Losers" },
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

function formatUsdValue(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
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

function normalizePosition(raw: string): string {
  const value = raw.trim().toUpperCase();
  if (value.includes("QUARTERBACK") || value === "QB") return "QB";
  if (value.includes("RUNNING BACK") || value === "RB") return "RB";
  if (value.includes("WIDE RECEIVER") || value === "WR") return "WR";
  if (value.includes("TIGHT END") || value === "TE") return "TE";
  if (value.includes("KICKER") || value === "K") return "K";
  if (value.includes("DEF") || value.includes("DST")) return "DST";
  return value;
}

function extractAttributeValue(attributes: unknown, matchKey: (key: string) => boolean): unknown {
  if (!attributes) return undefined;
  if (Array.isArray(attributes)) {
    for (const entry of attributes) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const key = String(record.trait_type ?? record.traitType ?? record.name ?? record.key ?? "").toLowerCase();
      if (!key) continue;
      if (matchKey(key)) return record.value ?? record.val ?? record.text ?? record.content;
    }
  }
  if (typeof attributes === "object") {
    for (const [key, value] of Object.entries(attributes as Record<string, unknown>)) {
      if (matchKey(key.toLowerCase())) return value;
    }
  }
  return undefined;
}

function parseNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractPosition(attributes: unknown): string | null {
  const raw = extractAttributeValue(attributes, (key) => key.includes("position") || key === "pos");
  if (typeof raw === "string" && raw.trim()) return normalizePosition(raw);
  return null;
}

function extractSupply(attributes: unknown): number | null {
  const raw = extractAttributeValue(
    attributes,
    (key) => key.includes("supply") || key.includes("shares") || key.includes("outstanding")
  );
  const parsed = parseNumericValue(raw);
  if (parsed === null) return null;
  if (parsed > 1e12) return parsed / 1e18;
  return parsed;
}

function extractTeam(attributes: unknown): string | null {
  const raw = extractAttributeValue(attributes, (key) => key.includes("team") || key.includes("club"));
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
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

export default async function NflMarketPage({
  searchParams,
}: {
  searchParams: Promise<{
    trendDays?: string;
    windowHours?: string;
    series?: string;
    price_position?: string;
    price_team?: string;
    price_page?: string;
    price_q?: string;
  }>;
}) {
  const params = await searchParams;
  const trendDays = parseNumber(params.trendDays, 30, 7, 365);
  const windowHours = parseNumber(params.windowHours, 24, 1, 168);
  const series = SERIES_OPTIONS.find((opt) => opt.key === params.series)?.key ?? "all";
  const pricePositionParam = params.price_position?.toUpperCase();
  const priceTeamParam = params.price_team?.toUpperCase();
  const pricePositionFilter = pricePositionParam && pricePositionParam !== "ALL" ? pricePositionParam : undefined;
  const priceTeamFilter = priceTeamParam && priceTeamParam !== "ALL" ? priceTeamParam : undefined;
  const pricePageParam = parseNumber(params.price_page, 1, 1, 200);
  const priceQuery = params.price_q?.trim().toLowerCase() ?? "";

  const snapshot = await getSportfunMarketSnapshot({
    sport: "nfl",
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

  const trendData =
    series === "gainers" ? snapshot.trendGainers : series === "losers" ? snapshot.trendLosers : snapshot.trend;
  const pricePoints = trendData
    .filter((p) => p.avgPriceUsdcRaw)
    .map((p) => ({ ts: p.ts, price: BigInt(p.avgPriceUsdcRaw ?? "0") }));

  const volumePoints = trendData.map((p) => ({ ts: p.ts, volume: BigInt(p.volumeSharesRaw ?? "0") }));
  const hasTrend = trendData.length > 1 && pricePoints.length > 1;

  const pricePointsAll = snapshot.trend
    .filter((p) => p.avgPriceUsdcRaw)
    .map((p) => ({ ts: p.ts, price: BigInt(p.avgPriceUsdcRaw ?? "0") }));
  const latestPricePoint = pricePointsAll.length ? pricePointsAll[pricePointsAll.length - 1] : undefined;
  const prevPricePoint = pricePointsAll.length > 1 ? pricePointsAll[pricePointsAll.length - 2] : undefined;
  const marketTrend24hDeltaRaw =
    latestPricePoint && prevPricePoint ? latestPricePoint.price - prevPricePoint.price : undefined;
  const marketTrend24hPct =
    latestPricePoint && prevPricePoint && prevPricePoint.price !== 0n
      ? (Number(marketTrend24hDeltaRaw) / Number(prevPricePoint.price)) * 100
      : undefined;

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

  const gainersCount = snapshot.tokens.filter((t) => (t.priceChange24hPercent ?? 0) > 0).length;
  const losersCount = snapshot.tokens.filter((t) => (t.priceChange24hPercent ?? 0) < 0).length;
  const neutralCount = Math.max(0, snapshot.tokens.length - gainersCount - losersCount);
  const inactiveTokens = snapshot.tokens.filter((t) => t.trades24h === 0);
  const inactiveCount = inactiveTokens.length;
  const inactiveTop = inactiveTokens
    .slice()
    .sort((a, b) => {
      const aPrice = BigInt(a.currentPriceUsdcRaw ?? "0");
      const bPrice = BigInt(b.currentPriceUsdcRaw ?? "0");
      if (aPrice === bPrice) return a.tokenIdDec.localeCompare(b.tokenIdDec);
      return bPrice > aPrice ? 1 : -1;
    })
    .slice(0, 12);
  const inactiveShort = inactiveTop.slice(0, 6);

  const mostActive = snapshot.tokens
    .slice()
    .sort((a, b) => {
      const aTrades = a.trades24h ?? 0;
      const bTrades = b.trades24h ?? 0;
      if (aTrades !== bTrades) return bTrades - aTrades;
      const aVolume = BigInt(a.volume24hSharesRaw ?? "0");
      const bVolume = BigInt(b.volume24hSharesRaw ?? "0");
      if (aVolume === bVolume) return 0;
      return bVolume > aVolume ? 1 : -1;
    })
    .slice(0, 12);

  const currentPrices = snapshot.tokens
    .slice()
    .sort((a, b) => {
      const aPrice = BigInt(a.currentPriceUsdcRaw ?? "0");
      const bPrice = BigInt(b.currentPriceUsdcRaw ?? "0");
      if (aPrice === bPrice) return a.tokenIdDec.localeCompare(b.tokenIdDec);
      return bPrice > aPrice ? 1 : -1;
    });
  const pricePositions = Array.from(
    new Set(
      currentPrices
        .map((row) => row.position ?? (row.attributes ? extractPosition(row.attributes) : null))
        .filter((value): value is string => typeof value === "string" && Boolean(value))
        .map((value) => value.toUpperCase())
    )
  ).sort();
  const priceTeams = Array.from(
    new Set(
      currentPrices
        .map((row) => row.team ?? (row.attributes ? extractTeam(row.attributes) : null))
        .filter((value): value is string => typeof value === "string" && Boolean(value))
        .map((value) => value.toUpperCase())
    )
  ).sort();
  const currentPricesFiltered = currentPrices.filter((row) => {
    const position = row.position ?? (row.attributes ? extractPosition(row.attributes) : null);
    const team = row.team ?? (row.attributes ? extractTeam(row.attributes) : null);
    if (pricePositionFilter && (position ?? "").toUpperCase() !== pricePositionFilter) return false;
    if (priceTeamFilter && (team ?? "").toUpperCase() !== priceTeamFilter) return false;
    if (priceQuery) {
      const label = (row.name ?? `#${row.tokenIdDec}`).toLowerCase();
      if (!label.includes(priceQuery)) return false;
    }
    return true;
  });
  const pricePageSize = 50;
  const priceTotalPages = Math.max(1, Math.ceil(currentPricesFiltered.length / pricePageSize));
  const pricePageSafe = Math.min(priceTotalPages, Math.max(1, pricePageParam));
  const pricePageRows = currentPricesFiltered.slice(
    (pricePageSafe - 1) * pricePageSize,
    pricePageSafe * pricePageSize
  );
  const sentiment =
    gainersCount > losersCount ? "Bullish" : losersCount > gainersCount ? "Bearish" : "Neutral";

  const priceMin = snapshot.summary.priceMinUsdcRaw ? toUsdNumber(snapshot.summary.priceMinUsdcRaw) : undefined;
  const priceMax = snapshot.summary.priceMaxUsdcRaw ? toUsdNumber(snapshot.summary.priceMaxUsdcRaw) : undefined;
  const priceSpread =
    priceMin !== undefined && priceMax !== undefined ? Math.max(0, priceMax - priceMin) : undefined;
  const priceSpreadPct =
    priceMin && priceSpread !== undefined ? Math.abs(priceSpread / priceMin) * 100 : undefined;

  let totalMarketCap = 0;
  let marketCapTokens = 0;
  for (const token of snapshot.tokens) {
    const supply = token.supply ?? extractSupply(token.attributes);
    const price = token.currentPriceUsdcRaw ? toUsdNumber(token.currentPriceUsdcRaw) : 0;
    if (supply && price) {
      totalMarketCap += price * supply;
      marketCapTokens += 1;
    }
  }

  const positionMap = new Map<
    string,
    { count: number; sumChange: number; gainers: number; losers: number }
  >();
  for (const token of snapshot.tokens) {
    const position = token.position ?? extractPosition(token.attributes);
    if (!position) continue;
    const entry = positionMap.get(position) ?? { count: 0, sumChange: 0, gainers: 0, losers: 0 };
    const change = token.priceChange24hPercent ?? 0;
    entry.count += 1;
    entry.sumChange += change;
    if (change > 0) entry.gainers += 1;
    if (change < 0) entry.losers += 1;
    positionMap.set(position, entry);
  }
  const positionTotal = Array.from(positionMap.values()).reduce((acc, row) => acc + row.count, 0);
  const positionRows = Array.from(positionMap.entries())
    .map(([position, row]) => ({
      position,
      count: row.count,
      avgChange: row.count ? row.sumChange / row.count : 0,
      gainers: row.gainers,
      losers: row.losers,
      share: positionTotal ? (row.count / positionTotal) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const seriesLabel = SERIES_OPTIONS.find((opt) => opt.key === series)?.label ?? "All";

  return (
    <NflPageShell title="NFL Market Overview" description="Sport.fun on-chain market snapshot and price activity.">
      <section className="mt-6 flex flex-wrap gap-3">
        {WINDOW_OPTIONS.map((hours) => (
          <Link
            key={hours}
            className={`rounded-full border px-3 py-2 text-xs ${
              hours === windowHours
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl${buildQuery({
              windowHours: String(hours),
              trendDays: String(trendDays),
              series,
            })}`}
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
            href={`/nfl${buildQuery({
              windowHours: String(windowHours),
              trendDays: String(days),
              series,
            })}`}
          >
            {days}d trend
          </Link>
        ))}
      </section>

      <section className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        <p>Snapshot updated {formatDate(snapshot.asOf)}.</p>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total tokens</div>
          <div className="mt-2 text-2xl font-semibold text-black dark:text-white">{snapshot.summary.totalTokens}</div>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Active (24h)</div>
          <div className="mt-2 text-2xl font-semibold text-black dark:text-white">{snapshot.summary.activeTokens24h}</div>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Inactive (24h)</div>
          <div className="mt-2 text-2xl font-semibold text-black dark:text-white">{inactiveCount}</div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">No trades in the last {windowHours}h</div>
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
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Est. market cap</div>
          <div className="mt-2 text-2xl font-semibold text-black dark:text-white">
            {marketCapTokens > 0 ? formatUsdValue(totalMarketCap) : "—"}
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {marketCapTokens > 0 ? `Based on ${marketCapTokens} tokens` : "No supply metadata"}
          </div>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Market sentiment</div>
          <div className="mt-2 text-2xl font-semibold text-black dark:text-white">{sentiment}</div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {gainersCount} gainers · {losersCount} losers · {neutralCount} flat
          </div>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Market trend (24h)</div>
          <div
            className={`mt-2 text-2xl font-semibold ${
              (marketTrend24hPct ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"
            }`}
          >
            {marketTrend24hPct !== undefined ? `${marketTrend24hPct.toFixed(2)}%` : "—"}
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {marketTrend24hDeltaRaw !== undefined ? formatUsd(marketTrend24hDeltaRaw.toString()) : "No 24h trend"}
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
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Current prices
          </div>
          <div className="border-b border-black/10 px-3 py-3 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-400">
            <form className="flex flex-wrap items-end gap-3" method="get">
              <input type="hidden" name="windowHours" value={String(windowHours)} />
              <input type="hidden" name="trendDays" value={String(trendDays)} />
              <input type="hidden" name="series" value={series} />
              <label className="flex flex-col gap-1">
                <span>Search</span>
                <input
                  name="price_q"
                  defaultValue={priceQuery}
                  placeholder="Player name"
                  className="min-w-[160px] rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
                />
              </label>
              <div className="flex items-center gap-2">
                {["QB", "RB", "WR", "TE", "K", "DST"].map((pos) => (
                  <Link
                    key={pos}
                    className={`rounded-full border px-3 py-1 text-[11px] uppercase ${
                      pricePositionFilter === pos
                        ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                        : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                    }`}
                    href={`/nfl${buildQuery({
                      windowHours: String(windowHours),
                      trendDays: String(trendDays),
                      series,
                      price_position: pos,
                      price_team: priceTeamFilter ?? undefined,
                      price_q: priceQuery || undefined,
                    })}`}
                  >
                    {pos}
                  </Link>
                ))}
              </div>
              <label className="flex flex-col gap-1">
                <span>Position</span>
                <select
                  name="price_position"
                  defaultValue={pricePositionFilter ?? "all"}
                  className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
                >
                  <option value="all">All</option>
                  {pricePositions.map((pos) => (
                    <option key={pos} value={pos}>
                      {pos}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span>Team</span>
                <select
                  name="price_team"
                  defaultValue={priceTeamFilter ?? "all"}
                  className="min-w-[140px] rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
                >
                  <option value="all">All</option>
                  {priceTeams.map((team) => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="rounded-md border border-black/10 bg-black px-3 py-1 text-xs text-white hover:bg-zinc-800 dark:border-white/10 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Apply
              </button>
              <Link
                className="text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                href={`/nfl${buildQuery({
                  windowHours: String(windowHours),
                  trendDays: String(trendDays),
                  series,
                })}`}
              >
                Reset
              </Link>
              <div className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">
                {currentPricesFiltered.length} tokens · page {pricePageSafe} / {priceTotalPages}
              </div>
            </form>
          </div>
          <div className="max-h-[620px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-black dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Pos</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Δ (24h)</th>
                  <th className="px-3 py-2">Volume</th>
                  <th className="px-3 py-2">Trades</th>
                  <th className="px-3 py-2">Last trade</th>
                </tr>
              </thead>
              <tbody>
                {pricePageRows.map((row) => {
                  const position = row.position ?? (row.attributes ? extractPosition(row.attributes) : null);
                  return (
                    <tr key={row.tokenIdDec} className="border-t border-black/10 dark:border-white/10">
                      <td className="px-3 py-2 text-black dark:text-white">{row.name ?? `#${row.tokenIdDec}`}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{position ?? "—"}</td>
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
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.trades24h ?? 0}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                        {row.lastTradeAt ? formatDate(row.lastTradeAt) : "—"}
                      </td>
                    </tr>
                  );
                })}
                {pricePageRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={7}>
                      No token prices available.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="border-t border-black/10 px-3 py-2 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-400">
            <Link
              className="hover:underline"
              href={`/nfl/prices${buildQuery({
                windowHours: String(windowHours),
                position: pricePositionFilter ?? undefined,
                team: priceTeamFilter ?? undefined,
                q: priceQuery || undefined,
              })}`}
            >
              Open full prices table →
            </Link>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-black/10 px-3 py-2 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-400">
            <Link
              href={`/nfl${buildQuery({
                windowHours: String(windowHours),
                trendDays: String(trendDays),
                series,
                price_position: pricePositionFilter ?? undefined,
                price_team: priceTeamFilter ?? undefined,
                price_q: priceQuery || undefined,
                price_page: String(Math.max(1, pricePageSafe - 1)),
              })}`}
              className={pricePageSafe > 1 ? "hover:underline" : "pointer-events-none opacity-40"}
            >
              Prev
            </Link>
            <span>
              Page {pricePageSafe} of {priceTotalPages}
            </span>
            <Link
              href={`/nfl${buildQuery({
                windowHours: String(windowHours),
                trendDays: String(trendDays),
                series,
                price_position: pricePositionFilter ?? undefined,
                price_team: priceTeamFilter ?? undefined,
                price_q: priceQuery || undefined,
                price_page: String(Math.min(priceTotalPages, pricePageSafe + 1)),
              })}`}
              className={pricePageSafe < priceTotalPages ? "hover:underline" : "pointer-events-none opacity-40"}
            >
              Next
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Inactive tokens (no trades in {windowHours}h)
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Supply</th>
                <th className="px-3 py-2">Last trade</th>
              </tr>
            </thead>
            <tbody>
              {inactiveTop.map((row) => {
                const position = row.position ?? (row.attributes ? extractPosition(row.attributes) : null);
                const supply = row.supply ?? (row.attributes ? extractSupply(row.attributes) : null);
                return (
                  <tr key={row.tokenIdDec} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{row.name ?? `#${row.tokenIdDec}`}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{position ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatUsd(row.currentPriceUsdcRaw)}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {supply !== null ? supply.toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.lastTradeAt ? formatDate(row.lastTradeAt) : "—"}
                    </td>
                  </tr>
                );
              })}
              {inactiveTop.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={5}>
                    No inactive tokens in the current window.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Position breakdown
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Position</th>
                <th className="px-3 py-2">Tokens</th>
                <th className="px-3 py-2">Share</th>
                <th className="px-3 py-2">Avg Δ</th>
                <th className="px-3 py-2">Gainers</th>
                <th className="px-3 py-2">Losers</th>
              </tr>
            </thead>
            <tbody>
              {positionRows.map((row) => (
                <tr key={row.position} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">{row.position}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.count}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.share.toFixed(1)}%</td>
                  <td
                    className={`px-3 py-2 ${
                      row.avgChange >= 0 ? "text-emerald-500" : "text-rose-500"
                    }`}
                  >
                    {formatPercent(row.avgChange)}
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.gainers}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.losers}</td>
                </tr>
              ))}
              {positionRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={6}>
                    No position metadata found for this window.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Price trends</div>
              <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {seriesLabel} avg price + volume over the last {trendDays} days.
              </div>
            </div>
            <div className="flex items-center gap-2">
              {SERIES_OPTIONS.map((opt) => (
                <Link
                  key={opt.key}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    opt.key === series
                      ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                      : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                  }`}
                  href={`/nfl${buildQuery({
                    windowHours: String(windowHours),
                    trendDays: String(trendDays),
                    series: opt.key,
                  })}`}
                >
                  {opt.label}
                </Link>
              ))}
              <div className="text-xs text-zinc-500 dark:text-zinc-400">{trendData.length} points</div>
            </div>
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
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
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
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Price spread</div>
              <div className="mt-1 text-lg text-black dark:text-white">
                {priceSpread !== undefined ? formatUsdValue(priceSpread) : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Spread %</div>
              <div className="mt-1 text-lg text-black dark:text-white">
                {priceSpreadPct !== undefined ? `${priceSpreadPct.toFixed(2)}%` : "—"}
              </div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
              <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                Most active (24h)
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                  <tr>
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2">Trades</th>
                    <th className="px-3 py-2">Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {mostActive.map((row) => (
                    <tr key={`active-${row.tokenIdDec}`} className="border-t border-black/10 dark:border-white/10">
                      <td className="px-3 py-2 text-black dark:text-white">{row.name ?? `#${row.tokenIdDec}`}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.trades24h ?? 0}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                        {formatShares(row.volume24hSharesRaw, 2)}
                      </td>
                    </tr>
                  ))}
                  {mostActive.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={3}>
                        No active tokens in the window.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
              <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                Most inactive (24h)
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                  <tr>
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2">Price</th>
                    <th className="px-3 py-2">Last trade</th>
                  </tr>
                </thead>
                <tbody>
                  {inactiveShort.map((row) => (
                    <tr key={`inactive-${row.tokenIdDec}`} className="border-t border-black/10 dark:border-white/10">
                      <td className="px-3 py-2 text-black dark:text-white">{row.name ?? `#${row.tokenIdDec}`}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatUsd(row.currentPriceUsdcRaw)}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                        {row.lastTradeAt ? formatDate(row.lastTradeAt) : "—"}
                      </td>
                    </tr>
                  ))}
                  {inactiveShort.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={3}>
                        No inactive tokens in the window.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </NflPageShell>
  );
}
