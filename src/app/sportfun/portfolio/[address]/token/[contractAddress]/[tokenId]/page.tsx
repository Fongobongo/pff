import Link from "next/link";
import { z } from "zod";
import { shortenAddress } from "@/lib/format";
import { getBaseUrl } from "@/lib/serverBaseUrl";
import { getSportfunNameOverride, getSportfunSportLabel } from "@/lib/sportfunNames";
import HistoryExport from "./HistoryExport";

const paramsSchema = z.object({
  address: z.string().min(1),
  contractAddress: z.string().min(1),
  tokenId: z.string().min(1),
});

const searchSchema = z.object({
  cursor: z.string().optional(),
  pageSize: z.string().optional(),
  bucket: z.string().optional(),
});

type SportfunPortfolioResponse = {
  address: string;
  assumptions: {
    usdc: {
      contractAddress: string;
      decimals: number;
      note: string;
    };
  };
  summary: {
    activityCount: number;
    activityCountReturned?: number;
    activityCountTotal?: number;
    activityTruncated?: boolean;
    activityCursor?: number;
    nextActivityCursor?: number;
    scanIncomplete?: boolean;
  };
  analytics?: {
    positionsByToken?: Array<{
      playerToken: string;
      tokenIdDec: string;
      holdingSharesRaw: string;
      trackedSharesRaw: string;
      avgCostUsdcPerShareRaw?: string;
      currentPriceUsdcPerShareRaw?: string;
      currentValueHoldingUsdcRaw?: string;
      unrealizedPnlTrackedUsdcRaw?: string;
      totals?: {
        boughtSharesRaw: string;
        soldSharesRaw: string;
        spentUsdcRaw: string;
        receivedUsdcRaw: string;
        freeSharesInRaw: string;
        freeEvents: number;
      };
    }>;
  };
  holdings: Array<{
    contractAddress: string;
    tokenIdDec: string;
    balanceRaw: string;
    metadata?: {
      name?: string;
      image?: string;
      imageUrl?: string;
    };
    metadataError?: string;
    priceUsdcPerShareRaw?: string;
    valueUsdcRaw?: string;
  }>;
  activity: Array<{
    hash: string;
    timestamp?: string;
    usdcDeltaRaw: string;
    erc1155Changes: Array<{
      contractAddress: string;
      tokenIdDec: string;
      deltaRaw: string;
    }>;
    decoded?: {
      trades: Array<{
        kind: "buy" | "sell";
        playerToken?: string;
        tokenIdDec: string;
        shareAmountRaw: string;
        currencyRaw: string;
        feeRaw: string;
        walletShareDeltaRaw: string;
        walletCurrencyDeltaRaw: string;
        priceUsdcPerShareRaw?: string;
        priceUsdcPerShareIncFeeRaw?: string;
      }>;
      promotions: Array<{
        kind: "promotion";
        playerToken?: string;
        tokenIdDec: string;
        shareAmountRaw: string;
        walletShareDeltaRaw: string;
      }>;
    };
  }>;
};

type TokenEvent = {
  kind: "buy" | "sell" | "promotion" | "transfer";
  hash: string;
  timestamp?: string;
  sharesDeltaRaw: string;
  usdcDeltaRaw?: string;
  priceUsdcPerShareRaw?: string;
  note?: string;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  return res.json();
}

const DISPLAY_DECIMALS = 5;

function formatFixed(raw: string, decimals: number, fractionDigits = DISPLAY_DECIMALS): string {
  if (!raw) return "0";
  const neg = raw.startsWith("-");
  const abs = BigInt(neg ? raw.slice(1) : raw);
  const safeDigits = Math.max(0, Math.min(fractionDigits, decimals));

  if (decimals <= safeDigits) {
    const base = 10n ** BigInt(decimals);
    const whole = abs / base;
    const frac = abs % base;
    const fracStr = frac.toString().padStart(decimals, "0");
    return `${neg ? "-" : ""}${whole.toString()}${decimals > 0 ? "." + fracStr : ""}`;
  }

  const scale = 10n ** BigInt(decimals - safeDigits);
  const rounded = (abs + scale / 2n) / scale;
  const base = 10n ** BigInt(safeDigits);
  const whole = rounded / base;
  const frac = rounded % base;
  const fracStr = frac.toString().padStart(safeDigits, "0");
  return `${neg ? "-" : ""}${whole.toString()}${safeDigits > 0 ? "." + fracStr : ""}`;
}

function formatSigned(raw: string, decimals: number): string {
  const formatted = formatFixed(raw, decimals);
  if (raw.startsWith("-")) return formatted;
  if (raw === "0") return formatted;
  return `+${formatted}`;
}

function formatShares(raw: string): string {
  return formatFixed(raw, 18);
}

function formatUsdc(raw: string, decimals: number): string {
  return formatFixed(raw, decimals);
}

function makeTokenKey(contractAddress?: string, tokenIdDec?: string): string | null {
  if (!contractAddress || !tokenIdDec) return null;
  return `${contractAddress.toLowerCase()}:${tokenIdDec}`;
}

function parseParam(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

type ChartBucket = "trade" | "day" | "week" | "month" | "year";

function getBucket(value: string | undefined): ChartBucket {
  if (value === "trade" || value === "day" || value === "week" || value === "month" || value === "year") return value;
  return "day";
}

function bucketStart(tsMs: number, bucket: ChartBucket): number {
  if (bucket === "trade") return tsMs;
  const d = new Date(tsMs);
  if (bucket === "day") {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  if (bucket === "month") {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  }
  if (bucket === "year") {
    return Date.UTC(d.getUTCFullYear(), 0, 1);
  }
  const day = d.getUTCDay();
  const delta = (day + 6) % 7; // Monday start
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - delta);
}

function buildHref(basePath: string, params: { cursor?: number; pageSize?: number; bucket?: ChartBucket }) {
  const search = new URLSearchParams();
  if (params.cursor && params.cursor > 0) search.set("cursor", String(params.cursor));
  if (params.pageSize && params.pageSize !== 2000) search.set("pageSize", String(params.pageSize));
  if (params.bucket && params.bucket !== "day") search.set("bucket", params.bucket);
  const qs = search.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

function formatBucketLabel(tsMs: number, bucket: ChartBucket): string {
  const d = new Date(tsMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  if (bucket === "month") return `${year}-${month}`;
  if (bucket === "year") return `${year}`;
  return `${year}-${month}-${day}`;
}

export default async function SportfunTokenHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string; contractAddress: string; tokenId: string }>;
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { address, contractAddress, tokenId } = paramsSchema.parse(await params);
  const search = searchSchema.parse({
    cursor: parseParam(searchParams?.cursor),
    pageSize: parseParam(searchParams?.pageSize),
    bucket: parseParam(searchParams?.bucket),
  });

  const pageSizeDefault = 2000;
  const pageSizeMax = 5000;
  const pageSize = Math.max(100, Math.min(pageSizeMax, parseNumber(search.pageSize, pageSizeDefault)));
  const activityCursor = Math.max(0, parseNumber(search.cursor, 0));
  const pageSizeOptions = [500, 2000, 5000];
  const chartBucket = getBucket(search.bucket);

  const base = await getBaseUrl();
  const data = await getJson<SportfunPortfolioResponse>(
    `${base}/api/sportfun/portfolio/${address}?scanMode=full&maxPages=200&maxCount=0x3e8&maxActivity=${pageSize}&activityCursor=${activityCursor}&includeTrades=1&includePrices=1&includeMetadata=0`
  );

  const tokenKey = `${contractAddress.toLowerCase()}:${tokenId}`;
  const matchesToken = (addr?: string, id?: string) => makeTokenKey(addr, id) === tokenKey;

  const holding = data.holdings.find((h) => matchesToken(h.contractAddress, h.tokenIdDec));
  const position = data.analytics?.positionsByToken?.find((p) => matchesToken(p.playerToken, p.tokenIdDec));

  const nameOverride = getSportfunNameOverride(contractAddress, tokenId);
  const displayName = holding?.metadata?.name ?? nameOverride ?? `#${tokenId}`;
  const sportLabel = getSportfunSportLabel(contractAddress).toUpperCase();
  const decimals = data.assumptions.usdc.decimals ?? 6;

  const events: TokenEvent[] = [];

  for (const activity of data.activity) {
    const trades = (activity.decoded?.trades ?? []).filter((t) => matchesToken(t.playerToken, t.tokenIdDec));
    const promotions = (activity.decoded?.promotions ?? []).filter((p) => matchesToken(p.playerToken, p.tokenIdDec));

    for (const trade of trades) {
      events.push({
        kind: trade.kind,
        hash: activity.hash,
        timestamp: activity.timestamp,
        sharesDeltaRaw: trade.walletShareDeltaRaw,
        usdcDeltaRaw: trade.walletCurrencyDeltaRaw,
        priceUsdcPerShareRaw: trade.priceUsdcPerShareRaw,
      });
    }

    for (const promo of promotions) {
      events.push({
        kind: "promotion",
        hash: activity.hash,
        timestamp: activity.timestamp,
        sharesDeltaRaw: promo.walletShareDeltaRaw,
      });
    }

    if (trades.length === 0 && promotions.length === 0) {
      const changes = activity.erc1155Changes.filter((c) => matchesToken(c.contractAddress, c.tokenIdDec));
      for (const change of changes) {
        events.push({
          kind: "transfer",
          hash: activity.hash,
          timestamp: activity.timestamp,
          sharesDeltaRaw: change.deltaRaw,
          note: "erc1155 delta",
        });
      }
    }
  }

  let boughtShares = 0n;
  let soldShares = 0n;
  let spentUsdc = 0n;
  let receivedUsdc = 0n;
  let netShares = 0n;

  for (const event of events) {
    const shareDelta = BigInt(event.sharesDeltaRaw);
    netShares += shareDelta;

    if (event.kind === "buy") boughtShares += shareDelta;
    if (event.kind === "sell") soldShares += -shareDelta;
    if (event.usdcDeltaRaw) {
      const usdc = BigInt(event.usdcDeltaRaw);
      if (usdc < 0n) spentUsdc += -usdc;
      if (usdc > 0n) receivedUsdc += usdc;
    }
  }

  const txCount = new Set(events.map((e) => e.hash)).size;
  const nextCursor = data.summary.nextActivityCursor;
  const prevCursor = activityCursor > 0 ? Math.max(0, activityCursor - pageSize) : null;
  const basePath = `/sportfun/portfolio/${address}/token/${contractAddress}/${tokenId}`;

  const tradeEvents = events.filter((e) => e.kind === "buy" || e.kind === "sell");
  const bucketAgg = new Map<number, { ts: number; volume: bigint; priceVolumeSum: bigint }>();

  for (const e of tradeEvents) {
    const tsRaw = e.timestamp ? Date.parse(e.timestamp) : NaN;
    if (!Number.isFinite(tsRaw)) continue;
    const ts = bucketStart(tsRaw, chartBucket);
    const shares = BigInt(e.sharesDeltaRaw);
    const volume = shares < 0n ? -shares : shares;
    if (volume === 0n) continue;
    const agg = bucketAgg.get(ts) ?? { ts, volume: 0n, priceVolumeSum: 0n };
    agg.volume += volume;
    if (e.priceUsdcPerShareRaw) {
      const price = BigInt(e.priceUsdcPerShareRaw);
      agg.priceVolumeSum += price * volume;
    }
    bucketAgg.set(ts, agg);
  }

  const bucketPoints = Array.from(bucketAgg.values()).sort((a, b) => a.ts - b.ts);
  const tradeVolumePoints = bucketPoints.map((p) => ({ ts: p.ts, volume: p.volume }));
  const pricePoints = bucketPoints
    .filter((p) => p.priceVolumeSum > 0n && p.volume > 0n)
    .map((p) => ({ ts: p.ts, price: p.priceVolumeSum / p.volume }));

  const hasChart = tradeVolumePoints.length > 0;
  const minTs = hasChart ? Math.min(...tradeVolumePoints.map((p) => p.ts)) : 0;
  const maxTs = hasChart ? Math.max(...tradeVolumePoints.map((p) => p.ts)) : 1;
  const timeSpan = Math.max(1, maxTs - minTs);

  const priceValues = pricePoints.map((p) => p.price);
  const minPrice = priceValues.length ? priceValues.reduce((a, b) => (a < b ? a : b)) : 0n;
  const maxPrice = priceValues.length ? priceValues.reduce((a, b) => (a > b ? a : b)) : 0n;
  const priceRange = maxPrice > minPrice ? maxPrice - minPrice : 1n;

  const maxVolume = tradeVolumePoints.length
    ? tradeVolumePoints.map((p) => p.volume).reduce((a, b) => (a > b ? a : b))
    : 0n;
  const volumeRange = maxVolume > 0n ? maxVolume : 1n;

  const chartWidth = 700;
  const padX = 30;
  const padTop = 20;
  const priceHeight = 140;
  const volumeGap = 16;
  const volumeHeight = 50;
  const volumeTop = padTop + priceHeight + volumeGap;
  const volumeBottom = volumeTop + volumeHeight;
  const labelHeight = 16;
  const chartHeight = volumeBottom + padTop + labelHeight;

  const scaleX = (ts: number) =>
    padX + ((ts - minTs) / timeSpan) * (chartWidth - padX * 2);
  const scalePrice = (price: bigint) =>
    padTop + priceHeight - (Number(price - minPrice) / Number(priceRange)) * priceHeight;
  const scaleVolume = (volume: bigint) =>
    (Number(volume) / Number(volumeRange)) * volumeHeight;

  const pricePath = pricePoints
    .slice()
    .sort((a, b) => a.ts - b.ts)
    .map((p, idx) => `${idx === 0 ? "M" : "L"} ${scaleX(p.ts).toFixed(2)} ${scalePrice(p.price).toFixed(2)}`)
    .join(" ");

  const barWidth = Math.max(
    1,
    Math.min(10, ((chartWidth - padX * 2) / Math.max(1, tradeVolumePoints.length)) * 0.7)
  );
  const tickTimes = (() => {
    if (!hasChart) return [] as number[];
    const points = bucketPoints;
    const maxTicks = 5;
    if (points.length <= maxTicks) return points.map((p) => p.ts);
    const ticks = new Set<number>();
    for (let i = 0; i < maxTicks; i++) {
      const idx = Math.round((i * (points.length - 1)) / (maxTicks - 1));
      ticks.add(points[idx].ts);
    }
    return Array.from(ticks.values()).sort((a, b) => a - b);
  })();

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Athlete history</h1>
          <p className="text-sm text-gray-400">
            {sportLabel} · {displayName}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {contractAddress} · token #{tokenId}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link className="text-sm text-blue-400 hover:underline" href={`/sportfun/portfolio/${address}`}>
            Back to portfolio
          </Link>
          <Link className="text-sm text-blue-400 hover:underline" href={`/`}>
            Home
          </Link>
        </div>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Current shares</div>
          <div className="mt-2 text-xl text-white">{formatShares(holding?.balanceRaw ?? position?.holdingSharesRaw ?? "0")}</div>
          <p className="mt-1 text-xs text-gray-500">On-chain balance</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Current price/share</div>
          <div className="mt-2 text-xl text-white">
            {holding?.priceUsdcPerShareRaw || position?.currentPriceUsdcPerShareRaw
              ? formatUsdc(holding?.priceUsdcPerShareRaw ?? position?.currentPriceUsdcPerShareRaw ?? "0", decimals)
              : "—"}
          </div>
          <p className="mt-1 text-xs text-gray-500">USDC</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Current value</div>
          <div className="mt-2 text-xl text-white">
            {holding?.valueUsdcRaw || position?.currentValueHoldingUsdcRaw
              ? formatUsdc(holding?.valueUsdcRaw ?? position?.currentValueHoldingUsdcRaw ?? "0", decimals)
              : "—"}
          </div>
          <p className="mt-1 text-xs text-gray-500">USDC</p>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Net shares (history)</div>
          <div className="mt-2 text-xl text-white">{formatSigned(netShares.toString(10), 18)}</div>
          <p className="mt-1 text-xs text-gray-500">
            Buys {formatShares(boughtShares.toString(10))} · Sells {formatShares(soldShares.toString(10))}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Total spent</div>
          <div className="mt-2 text-xl text-white">{formatUsdc(spentUsdc.toString(10), decimals)}</div>
          <p className="mt-1 text-xs text-gray-500">USDC</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Total received</div>
          <div className="mt-2 text-xl text-white">{formatUsdc(receivedUsdc.toString(10), decimals)}</div>
          <p className="mt-1 text-xs text-gray-500">USDC</p>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Avg cost/share</div>
          <div className="mt-2 text-xl text-white">
            {position?.avgCostUsdcPerShareRaw ? formatUsdc(position.avgCostUsdcPerShareRaw, decimals) : "—"}
          </div>
          <p className="mt-1 text-xs text-gray-500">USDC</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Unrealized PnL</div>
          <div
            className={
              position?.unrealizedPnlTrackedUsdcRaw
                ? BigInt(position.unrealizedPnlTrackedUsdcRaw) >= 0n
                  ? "mt-2 text-xl text-green-400"
                  : "mt-2 text-xl text-red-400"
                : "mt-2 text-xl text-white"
            }
          >
            {position?.unrealizedPnlTrackedUsdcRaw ? formatUsdc(position.unrealizedPnlTrackedUsdcRaw, decimals) : "—"}
          </div>
          <p className="mt-1 text-xs text-gray-500">USDC</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Activity rows</div>
          <div className="mt-2 text-xl text-white">{events.length}</div>
          <p className="mt-1 text-xs text-gray-500">{txCount} tx</p>
        </div>
      </section>

      {data.summary.activityTruncated || data.summary.scanIncomplete ? (
        <section className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-amber-300">History may be partial.</div>
          <p className="mt-1 text-xs text-gray-400">
            Activity scan incomplete or truncated. Use pagination or open the portfolio page to load more history.
          </p>
        </section>
      ) : null}

      <section className="mt-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Price & volume</h2>
            <p className="mt-1 text-xs text-gray-500">
              Bucketed by{" "}
              {chartBucket === "trade"
                ? "trade"
                : chartBucket === "day"
                  ? "day"
                  : chartBucket === "week"
                    ? "week"
                    : chartBucket === "month"
                      ? "month"
                      : "year"}
              . Based on the current activity page. {data.assumptions.usdc.note}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Bucket:</span>
            {(["trade", "day", "week", "month", "year"] as const).map((bucket) => (
              <Link
                key={bucket}
                className={bucket === chartBucket ? "text-white" : "text-blue-400 hover:underline"}
                href={buildHref(basePath, { cursor: activityCursor, pageSize, bucket })}
              >
                {bucket}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4">
          {hasChart ? (
            <svg
              className="w-full"
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              role="img"
              aria-label="Price and volume chart"
            >
              <rect x={0} y={0} width={chartWidth} height={chartHeight} fill="transparent" />
              <line x1={padX} y1={padTop} x2={padX} y2={volumeBottom} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <line x1={padX} y1={volumeBottom} x2={chartWidth - padX} y2={volumeBottom} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />

              <text x={padX} y={padTop - 6} fill="rgba(255,255,255,0.5)" fontSize="10">
                Price / share (USDC)
              </text>
              <text x={padX} y={volumeTop - 6} fill="rgba(255,255,255,0.5)" fontSize="10">
                Volume (shares)
              </text>

              {tradeVolumePoints.map((p, idx) => {
                const x = scaleX(p.ts);
                const h = scaleVolume(p.volume);
                return (
                  <rect
                    key={`v-${idx}`}
                    x={x - barWidth / 2}
                    y={volumeBottom - h}
                    width={barWidth}
                    height={h}
                    fill="rgba(56,189,248,0.45)"
                  >
                    <title>{`Date: ${formatBucketLabel(p.ts, chartBucket)}\nVolume: ${formatShares(p.volume.toString(10))}`}</title>
                  </rect>
                );
              })}

              {pricePath ? (
                <path d={pricePath} fill="none" stroke="rgba(244,114,182,0.9)" strokeWidth="2" />
              ) : null}

              {pricePoints.map((p, idx) => (
                <circle
                  key={`p-${idx}`}
                  cx={scaleX(p.ts)}
                  cy={scalePrice(p.price)}
                  r={2}
                  fill="rgba(244,114,182,0.9)"
                >
                  <title>{`Date: ${formatBucketLabel(p.ts, chartBucket)}\nPrice: ${formatUsdc(p.price.toString(10), decimals)}`}</title>
                </circle>
              ))}

              <text x={chartWidth - padX} y={padTop} fill="rgba(255,255,255,0.5)" fontSize="10" textAnchor="end">
                {pricePoints.length ? formatUsdc(maxPrice.toString(10), decimals) : "—"}
              </text>
              <text
                x={chartWidth - padX}
                y={padTop + priceHeight}
                fill="rgba(255,255,255,0.5)"
                fontSize="10"
                textAnchor="end"
              >
                {pricePoints.length ? formatUsdc(minPrice.toString(10), decimals) : "—"}
              </text>

              {tickTimes.map((ts) => (
                <g key={`tick-${ts}`}>
                  <line
                    x1={scaleX(ts)}
                    y1={volumeBottom}
                    x2={scaleX(ts)}
                    y2={volumeBottom + 4}
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="1"
                  />
                  <text
                    x={scaleX(ts)}
                    y={volumeBottom + labelHeight}
                    fill="rgba(255,255,255,0.5)"
                    fontSize="10"
                    textAnchor="middle"
                  >
                    {formatBucketLabel(ts, chartBucket)}
                  </text>
                </g>
              ))}
            </svg>
          ) : (
            <div className="text-sm text-gray-400">No trade activity on this page.</div>
          )}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">History</h2>
            <p className="mt-1 text-xs text-gray-500">{data.assumptions.usdc.note}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>Page size:</span>
              {pageSizeOptions.map((size) => (
                <Link
                  key={size}
                  className={size === pageSize ? "text-white" : "text-blue-400 hover:underline"}
                  href={buildHref(basePath, { cursor: activityCursor, pageSize: size, bucket: chartBucket })}
                >
                  {size}
                </Link>
              ))}
            </div>
            <HistoryExport events={events} filename={`sportfun-${address}-${contractAddress}-${tokenId}.csv`} />
            {prevCursor !== null ? (
              <Link className="text-sm text-blue-400 hover:underline" href={buildHref(basePath, { cursor: prevCursor, pageSize, bucket: chartBucket })}>
                Prev
              </Link>
            ) : (
              <span className="text-xs text-gray-600">Prev</span>
            )}
            {nextCursor !== undefined ? (
              <Link className="text-sm text-blue-400 hover:underline" href={buildHref(basePath, { cursor: nextCursor, pageSize, bucket: chartBucket })}>
                Next
              </Link>
            ) : (
              <span className="text-xs text-gray-600">Next</span>
            )}
          </div>
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-gray-300">
              <tr>
                <th className="p-3">Time</th>
                <th className="p-3">Kind</th>
                <th className="p-3">Shares Δ</th>
                <th className="p-3">USDC Δ</th>
                <th className="p-3">Price/share</th>
                <th className="p-3">Tx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {events.map((e, idx) => {
                const kindClass =
                  e.kind === "buy"
                    ? "text-green-400"
                    : e.kind === "sell"
                      ? "text-red-400"
                      : e.kind === "promotion"
                        ? "text-amber-300"
                        : "text-gray-400";

                return (
                  <tr key={`${e.hash}-${idx}`} className="text-gray-200">
                    <td className="p-3 whitespace-nowrap text-gray-400">{e.timestamp ?? "—"}</td>
                    <td className={`p-3 whitespace-nowrap ${kindClass}`}>{e.kind.toUpperCase()}</td>
                    <td className="p-3 whitespace-nowrap">{formatSigned(e.sharesDeltaRaw, 18)}</td>
                    <td className="p-3 whitespace-nowrap">
                      {e.usdcDeltaRaw ? formatSigned(e.usdcDeltaRaw, decimals) : "—"}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {e.priceUsdcPerShareRaw ? formatUsdc(e.priceUsdcPerShareRaw, decimals) : "—"}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex flex-col">
                        <Link className="text-blue-400 hover:underline" href={`/sportfun/tx/${e.hash}`}>
                          Inspect
                        </Link>
                        <a
                          className="text-xs text-gray-500 hover:underline"
                          href={`https://basescan.org/tx/${e.hash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {shortenAddress(e.hash)}
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {events.length === 0 ? (
                <tr>
                  <td className="p-3 text-gray-400" colSpan={6}>
                    No activity for this token.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
