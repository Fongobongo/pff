"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { shortenAddress } from "@/lib/format";
import { getSportfunNameOverride, getSportfunSportLabel } from "@/lib/sportfunNames";

type SortKey = "value" | "pnl" | "spent" | "shares";


type SportfunPortfolioResponse = {
  chain: string;
  protocol: string;
  address: string;
  query?: {
    scanMode?: "default" | "full";
    maxPages?: number;
    maxCount?: string;
    maxActivity?: number;
    includeTrades?: boolean;
    includePrices?: boolean;
    includeReceipts?: boolean;
    includeUri?: boolean;
  };
  summary: {
    erc1155TransferCount: number;
    sportfunErc1155TransferCount: number;
    contractCount: number;
    holdingCount: number;
    activityCount: number;
    decodedTradeCount?: number;
    decodedPromotionCount?: number;
    shareDeltaMismatchCount?: number;
    shareDeltaMismatchTxCount?: number;
    activityCountTotal?: number;
    activityCountReturned?: number;
    activityTruncated?: boolean;
    nextActivityCursor?: number;
    activityCursor?: number;
    scanIncomplete?: boolean;
    scan?: unknown;
  };
  assumptions: {
    shareUnits: string;
    knownContracts: string[];
    usdc: {
      contractAddress: string;
      decimals: number;
      note: string;
    };
  };
  analytics?: {
    realizedPnlUsdcRaw: string;
    realizedPnlEconomicUsdcRaw?: string;
    unrealizedPnlUsdcRaw: string;
    totalCostBasisUsdcRaw: string;
    currentValueUsdcRaw: string;
    currentValueAllHoldingsUsdcRaw?: string;
    holdingsPricedCount?: number;
    costBasisUnknownTradeCount: number;
    positionsByToken?: Array<{
      playerToken: string;
      tokenIdDec: string;

      holdingSharesRaw: string;
      trackedSharesRaw: string;

      costBasisUsdcRaw: string;
      avgCostUsdcPerShareRaw?: string;

      currentPriceUsdcPerShareRaw?: string;
      currentValueHoldingUsdcRaw?: string;
      currentValueTrackedUsdcRaw?: string;

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
    note: string;
  };
  holdings: Array<{
    contractAddress: string;
    tokenIdHex: string;
    tokenIdDec: string;
    balanceRaw: string;
    uri?: string;
    uriError?: string;
    metadata?: {
      name?: string;
      description?: string;
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
    kind?: "buy" | "sell" | "unknown";
    usdcDeltaRaw: string;
    erc1155Changes: Array<{
      contractAddress: string;
      tokenIdHex: string;
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
  debug?: {
    shareDeltaMismatchSamples?: Array<{
      hash: string;
      contractAddress: string;
      tokenIdDec: string;
      expectedDeltaRaw: string;
      decodedDeltaRaw: string;
      residualDeltaRaw: string;
      reason: string;
    }>;
  };
};

type ActivityItem = SportfunPortfolioResponse["activity"][number];

function makeTokenKey(contractAddress?: string, tokenIdDec?: string): string | null {
  if (!contractAddress || !tokenIdDec) return null;
  return `${contractAddress.toLowerCase()}:${tokenIdDec}`;
}

function splitTokenKey(key: string): { contractAddress: string; tokenIdDec: string } | null {
  const parts = key.split(":");
  if (parts.length !== 2) return null;
  const [contractAddress, tokenIdDec] = parts;
  if (!contractAddress || !tokenIdDec) return null;
  return { contractAddress, tokenIdDec };
}

function activityHasToken(activity: ActivityItem, key: string): boolean {
  const keyLc = key.toLowerCase();
  for (const change of activity.erc1155Changes ?? []) {
    if (makeTokenKey(change.contractAddress, change.tokenIdDec) === keyLc) return true;
  }

  if (activity.decoded?.trades) {
    for (const trade of activity.decoded.trades) {
      if (makeTokenKey(trade.playerToken, trade.tokenIdDec) === keyLc) return true;
    }
  }

  if (activity.decoded?.promotions) {
    for (const promo of activity.decoded.promotions) {
      if (makeTokenKey(promo.playerToken, promo.tokenIdDec) === keyLc) return true;
    }
  }

  return false;
}

async function getJson<T>(url: string, timeoutMs = 20000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
    return res.json();
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timed out. Try again or reduce scan depth.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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

function formatShares(raw: string): string {
  return formatFixed(raw, 18);
}

function formatUsdc(raw: string, decimals: number): string {
  return formatFixed(raw, decimals);
}

export default function SportfunPortfolioClient({ address }: { address: string }) {
  const [data, setData] = useState<SportfunPortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attemptPages, setAttemptPages] = useState<number[]>([]);
  const [activityCursor, setActivityCursor] = useState<number | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityDone, setActivityDone] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [activityTokenFilter, setActivityTokenFilter] = useState<string>("all");
  const [fullScanLoading, setFullScanLoading] = useState(false);
  const [fullScanError, setFullScanError] = useState<string | null>(null);
  const [fullScanAttempts, setFullScanAttempts] = useState<number[]>([]);

  const decimals = data?.assumptions.usdc.decimals ?? 6;
  const tokenLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!data?.holdings) return map;
    for (const holding of data.holdings) {
      const name =
        holding.metadata?.name?.trim() ??
        getSportfunNameOverride(holding.contractAddress, holding.tokenIdDec);
      if (name) {
        map.set(`${holding.contractAddress.toLowerCase()}:${holding.tokenIdDec}`, name);
      }
    }
    return map;
  }, [data?.holdings]);

  const getTokenLabel = useMemo(() => {
    return (contractAddress?: string, tokenIdDec?: string): string => {
      if (!tokenIdDec) return "—";
      if (!contractAddress) return tokenIdDec;
      const key = `${contractAddress.toLowerCase()}:${tokenIdDec}`;
      const override = getSportfunNameOverride(contractAddress, tokenIdDec);
      return tokenLabelMap.get(key) ?? override ?? tokenIdDec;
    };
  }, [tokenLabelMap]);

  function renderTokenLabel(contractAddress?: string, tokenIdDec?: string) {
    if (!tokenIdDec) return "—";
    const label = getTokenLabel(contractAddress, tokenIdDec);
    if (label === tokenIdDec) return label;
    return (
      <div className="flex flex-col">
        <span className="text-gray-100">{label}</span>
        <span className="text-xs text-gray-500">#{tokenIdDec}</span>
      </div>
    );
  }

  function formatTokenLabel(contractAddress?: string, tokenIdDec?: string) {
    if (!tokenIdDec) return "tokenId —";
    const label = getTokenLabel(contractAddress, tokenIdDec);
    if (label === tokenIdDec) return `tokenId ${tokenIdDec}`;
    return `${label} (#${tokenIdDec})`;
  }

  function tokenHistoryHref(contractAddress?: string, tokenIdDec?: string) {
    if (!contractAddress || !tokenIdDec) return null;
    return `/sportfun/portfolio/${address}/token/${contractAddress}/${tokenIdDec}`;
  }

  const buildRequestUrl = useMemo(() => {
    return (params: {
      scanMode: "default" | "full";
      maxPages: number;
      maxActivity: number;
      includeTrades?: boolean;
      includePrices?: boolean;
      includeMetadata?: boolean;
      includeUri?: boolean;
      metadataLimit?: number;
      activityCursor?: number;
    }) => {
      const query = new URLSearchParams();
      query.set("scanMode", params.scanMode);
      query.set("maxPages", String(params.maxPages));
      query.set("maxCount", "0x3e8");
      query.set("maxActivity", String(params.maxActivity));
      if (params.activityCursor !== undefined) query.set("activityCursor", String(params.activityCursor));
      if (params.metadataLimit !== undefined) query.set("metadataLimit", String(params.metadataLimit));
      query.set("includeTrades", params.includeTrades ? "1" : "0");
      query.set("includePrices", params.includePrices ? "1" : "0");
      query.set("includeMetadata", params.includeMetadata ? "1" : "0");
      query.set("includeUri", params.includeUri ? "1" : "0");
      return `/api/sportfun/portfolio/${address}?${query.toString()}`;
    };
  }, [address]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      setAttemptPages([]);
      setActivityCursor(null);
      setActivityDone(false);
      setActivityTokenFilter("all");

      // Quick scan first so the UI is responsive, then optionally run a deeper scan.
      const caps = [3, 6, 10];
      let last: SportfunPortfolioResponse | null = null;

      for (const pages of caps) {
        if (cancelled) return;
        setAttemptPages((x) => [...x, pages]);

        const next = await getJson<SportfunPortfolioResponse>(
          buildRequestUrl({
            scanMode: "default",
            maxPages: pages,
            maxActivity: 150,
            includePrices: true,
          })
        );
        if (cancelled) return;

        last = next;
        setData(next);

        if (!next.summary.scanIncomplete) break;
      }

      if (last) {
        const cursor = last.summary.nextActivityCursor;
        setActivityCursor(cursor ?? null);
        setActivityDone(!cursor);
      }

      setLoading(false);
    }

    run().catch((e: unknown) => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [buildRequestUrl]);

  useEffect(() => {
    if (!data) return;
    if (activityDone) return;
    if (activityLoading) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (!activityCursor || activityLoading || activityDone) return;

        setActivityLoading(true);
        getJson<SportfunPortfolioResponse>(
          buildRequestUrl({
            scanMode: data.query?.scanMode ?? "default",
            maxPages: data.query?.maxPages ?? 10,
            maxActivity: data.query?.maxActivity ?? 150,
            activityCursor,
            includeTrades: Boolean(data.query?.includeTrades),
          })
        )
          .then((next) => {
            setData((prev) => {
              if (!prev) return next;
              const merged = {
                ...next,
                holdings: prev.holdings,
                analytics: prev.analytics,
                assumptions: prev.assumptions,
                query: prev.query,
                summary: {
                  ...prev.summary,
                  ...next.summary,
                  activityCountReturned: (prev.summary.activityCountReturned ?? prev.activity.length) + next.activity.length,
                },
                activity: [...prev.activity, ...next.activity],
              } satisfies SportfunPortfolioResponse;
              return merged;
            });

            const cursor = next.summary.nextActivityCursor;
            setActivityCursor(cursor ?? null);
            setActivityDone(!cursor);
          })
          .catch((e: unknown) => {
            setError(e instanceof Error ? e.message : String(e));
          })
          .finally(() => {
            setActivityLoading(false);
          });
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activityCursor, activityDone, activityLoading, data, requestActivityPageUrl]);

  const positions = useMemo(() => data?.analytics?.positionsByToken ?? [], [data?.analytics?.positionsByToken]);

  const filteredPositions = positions.filter((p) => {
    if (sportFilter === "all") return true;
    return getSportfunSportLabel(p.playerToken) === sportFilter;
  });

  const sortedPositions = [...filteredPositions].sort((a, b) => {
    const av = (s: string | undefined) => BigInt(s ?? "0");

    const keyToValue = (p: (typeof positions)[number]) => {
      switch (sortKey) {
        case "spent":
          return av(p.totals?.spentUsdcRaw);
        case "pnl":
          return av(p.unrealizedPnlTrackedUsdcRaw);
        case "shares":
          return av(p.holdingSharesRaw);
        case "value":
        default:
          return av(p.currentValueHoldingUsdcRaw);
      }
    };

    const left = keyToValue(a);
    const right = keyToValue(b);

    if (left === right) return 0;
    const cmp = right > left ? 1 : -1;
    return sortDir === "desc" ? cmp : -cmp;
  });

  const activityTokenOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string }>();

    const add = (contractAddress?: string, tokenIdDec?: string) => {
      const key = makeTokenKey(contractAddress, tokenIdDec);
      if (!key || map.has(key)) return;
      const sport = getSportfunSportLabel(contractAddress).toUpperCase();
      const label = getTokenLabel(contractAddress, tokenIdDec);
      const name = label === tokenIdDec ? `#${tokenIdDec}` : `${label} (#${tokenIdDec})`;
      map.set(key, { value: key, label: `${sport} · ${name}` });
    };

    for (const p of positions) add(p.playerToken, p.tokenIdDec);
    for (const h of data?.holdings ?? []) add(h.contractAddress, h.tokenIdDec);

    for (const a of data?.activity ?? []) {
      for (const change of a.erc1155Changes ?? []) add(change.contractAddress, change.tokenIdDec);
      for (const trade of a.decoded?.trades ?? []) add(trade.playerToken, trade.tokenIdDec);
      for (const promo of a.decoded?.promotions ?? []) add(promo.playerToken, promo.tokenIdDec);
    }

    return [{ value: "all", label: "All athletes" }, ...Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))];
  }, [data?.activity, data?.holdings, positions, getTokenLabel]);

  const filteredActivity = useMemo(() => {
    if (!data) return [] as ActivityItem[];
    if (activityTokenFilter === "all") return data.activity;
    return data.activity.filter((a) => activityHasToken(a, activityTokenFilter));
  }, [activityTokenFilter, data]);

  if (loading && !data) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <div className="text-white">Loading full scan…</div>
        <div className="mt-2 text-sm text-gray-400">Address: {address}</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <div className="text-red-400">{error}</div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <div className="text-gray-400">No data.</div>
      </main>
    );
  }

  async function runFullScan() {
    setFullScanLoading(true);
    setFullScanError(null);
    setFullScanAttempts([]);
    try {
      const caps = [20, 50, 100];
      let last: SportfunPortfolioResponse | null = null;

      for (const pages of caps) {
        setFullScanAttempts((x) => [...x, pages]);
        const next = await getJson<SportfunPortfolioResponse>(
          buildRequestUrl({
            scanMode: "full",
            maxPages: pages,
            maxActivity: 200,
            includeTrades: true,
            includePrices: true,
            includeMetadata: false,
          }),
          30000
        );

        last = next;
        setData(next);
        if (!next.summary.scanIncomplete) break;
      }

      if (last) {
        const cursor = last.summary.nextActivityCursor;
        setActivityCursor(cursor ?? null);
        setActivityDone(!cursor);
      }
    } catch (err: unknown) {
      setFullScanError(err instanceof Error ? err.message : String(err));
    } finally {
      setFullScanLoading(false);
    }
  }

  async function runMetadataScan() {
    setFullScanLoading(true);
    setFullScanError(null);
    try {
      const next = await getJson<SportfunPortfolioResponse>(
        buildRequestUrl({
          scanMode: data.query?.scanMode ?? "default",
          maxPages: data.query?.maxPages ?? 10,
          maxActivity: data.query?.maxActivity ?? 150,
          includeTrades: false,
          includePrices: false,
          includeMetadata: true,
          includeUri: true,
          metadataLimit: 25,
        }),
        25000
      );
      setData(next);
    } catch (err: unknown) {
      setFullScanError(err instanceof Error ? err.message : String(err));
    } finally {
      setFullScanLoading(false);
    }
  }

  function exportPositionsCsv() {
    const header = [
      "playerName",
      "playerToken",
      "tokenIdDec",
      "holdingShares",
      "spentUsdc",
      "avgCostUsdcPerShare",
      "currentPriceUsdcPerShare",
      "currentValueHoldingUsdc",
      "unrealizedPnlTrackedUsdc",
      "trackedShares",
      "freeSharesIn",
      "freeEvents",
    ];

    const rows = sortedPositions.map((p) => [
      (() => {
        const label = getTokenLabel(p.playerToken, p.tokenIdDec);
        return label === p.tokenIdDec ? "" : label;
      })(),
      p.playerToken,
      p.tokenIdDec,
      p.holdingSharesRaw,
      p.totals?.spentUsdcRaw ?? "0",
      p.avgCostUsdcPerShareRaw ?? "",
      p.currentPriceUsdcPerShareRaw ?? "",
      p.currentValueHoldingUsdcRaw ?? "",
      p.unrealizedPnlTrackedUsdcRaw ?? "",
      p.trackedSharesRaw,
      p.totals?.freeSharesInRaw ?? "0",
      String(p.totals?.freeEvents ?? 0),
    ]);

    const csv = [header, ...rows]
      .map((r) => r.map((x) => `"${String(x).replaceAll('"', '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sportfun-positions-${address}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const contractOptions = [
    { value: "all", label: "All" },
    ...Array.from(new Set(positions.map((p) => getSportfunSportLabel(p.playerToken))))
      .sort()
      .map((sport) => ({ value: sport, label: sport.toUpperCase() })),
  ];

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Sport.fun portfolio</h1>
          <p className="text-sm text-gray-400">{address}</p>
          <p className="mt-1 text-xs text-gray-500">
            Auto-scan attempts: {attemptPages.length ? attemptPages.join(" → ") : "—"}
            {data.summary.scanIncomplete || data.summary.activityTruncated ? " (still incomplete)" : ""}
            {fullScanAttempts.length ? ` · full scan: ${fullScanAttempts.join(" → ")}` : ""}
            {fullScanLoading ? " · full scan running…" : ""}
          </p>
          {fullScanError ? <p className="mt-1 text-xs text-rose-400">Full scan failed: {fullScanError}</p> : null}
        </div>
        <div className="flex items-center gap-4">
          <button
            className="rounded-md border border-white/10 bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={runFullScan}
            disabled={fullScanLoading}
          >
            {fullScanLoading ? "Running full scan…" : "Run full scan"}
          </button>
          <button
            className="rounded-md border border-white/10 bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={runMetadataScan}
            disabled={fullScanLoading}
          >
            {fullScanLoading ? "Loading metadata…" : "Load metadata (top 25)"}
          </button>
          <Link className="text-sm text-blue-400 hover:underline" href={`/base/${address}`}>
            Base wallet
          </Link>
          <Link className="text-sm text-blue-400 hover:underline" href={`/`}>
            Home
          </Link>
        </div>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Holdings</div>
          <div className="mt-2 text-xl text-white">{data.summary.holdingCount}</div>
          <p className="mt-1 text-xs text-gray-500">Non-zero balances only.</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">ERC-1155 transfers (filtered)</div>
          <div className="mt-2 text-xl text-white">{data.summary.sportfunErc1155TransferCount}</div>
          <p className="mt-1 text-xs text-gray-500">Known Sport.fun contracts.</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Tx activity</div>
          <div className="mt-2 text-xl text-white">{data.summary.activityCount}</div>
          <p className="mt-1 text-xs text-gray-500">
            Showing {data.summary.activityCountReturned ?? data.activity.length}
            {data.summary.activityTruncated ? "/" + (data.summary.activityCountTotal ?? data.summary.activityCount) : ""}.
            {activityLoading ? " Loading more…" : activityDone ? " End of activity." : " Scroll for more."}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Decoded trades</div>
          <div className="mt-2 text-xl text-white">{data.summary.decodedTradeCount ?? 0}</div>
          <p className="mt-1 text-xs text-gray-500">
            FDFPairV2 events
            {data.summary.decodedPromotionCount !== undefined ? ` · promotions ${data.summary.decodedPromotionCount}` : ""}
            {data.summary.shareDeltaMismatchTxCount ? ` · reconciled ${data.summary.shareDeltaMismatchTxCount} tx` : ""}.
          </p>
        </div>
      </section>

      {data.analytics ? (
        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm text-gray-400">Current value</div>
            <div className="mt-2 text-xl text-white">
              {formatUsdc(data.analytics.currentValueAllHoldingsUsdcRaw ?? data.analytics.currentValueUsdcRaw, decimals)}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              USDC{data.analytics.holdingsPricedCount !== undefined ? ` · priced ${data.analytics.holdingsPricedCount}/${data.holdings.length}` : ""}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm text-gray-400">Cost basis</div>
            <div className="mt-2 text-xl text-white">{formatUsdc(data.analytics.totalCostBasisUsdcRaw, decimals)}</div>
            <p className="mt-1 text-xs text-gray-500">USDC</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm text-gray-400">Unrealized PnL</div>
            <div className={BigInt(data.analytics.unrealizedPnlUsdcRaw) >= 0n ? "mt-2 text-xl text-green-400" : "mt-2 text-xl text-red-400"}>
              {formatUsdc(data.analytics.unrealizedPnlUsdcRaw, decimals)}
            </div>
            <p className="mt-1 text-xs text-gray-500">USDC</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm text-gray-400">Realized PnL</div>
            <div className={BigInt(data.analytics.realizedPnlUsdcRaw) >= 0n ? "mt-2 text-xl text-green-400" : "mt-2 text-xl text-red-400"}>
              {formatUsdc(data.analytics.realizedPnlUsdcRaw, decimals)}
            </div>
            <p className="mt-1 text-xs text-gray-500">Cashflow · USDC</p>
            {data.analytics.realizedPnlEconomicUsdcRaw ? (
              <div className="mt-2 text-xs text-gray-400">
                Economic:{" "}
                <span className={BigInt(data.analytics.realizedPnlEconomicUsdcRaw) >= 0n ? "text-green-400" : "text-red-400"}>
                  {formatUsdc(data.analytics.realizedPnlEconomicUsdcRaw, decimals)}
                </span>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {positions.length ? (
        <section className="mt-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Per-athlete breakdown (on-chain)</h2>
              <p className="mt-1 text-sm text-gray-400">
                Sort/filter and export CSV. If you see <span className="text-gray-300">(partial)</span> under tracked shares, increase scan pages.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs text-gray-400">
                Sport
                <select
                  className="ml-2 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm text-gray-200"
                  value={sportFilter}
                  onChange={(e) => setSportFilter(e.target.value)}
                >
                  {contractOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs text-gray-400">
                Sort
                <select
                  className="ml-2 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm text-gray-200"
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                >
                  <option value="value">Value</option>
                  <option value="pnl">Unrealized PnL</option>
                  <option value="spent">Spent</option>
                  <option value="shares">Holding shares</option>
                </select>
              </label>

              <label className="text-xs text-gray-400">
                Dir
                <select
                  className="ml-2 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm text-gray-200"
                  value={sortDir}
                  onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
                >
                  <option value="desc">Desc</option>
                  <option value="asc">Asc</option>
                </select>
              </label>

              <button
                className="rounded-md border border-white/10 bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/15"
                onClick={exportPositionsCsv}
              >
                Export CSV
              </button>
            </div>
          </div>

          <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-left text-gray-300">
                <tr>
                  <th className="p-3">Sport</th>
                  <th className="p-3">Player</th>
                <th className="p-3">Holding shares</th>
                <th className="p-3">Spent</th>
                <th className="p-3">Avg cost/share</th>
                <th className="p-3">Current price/share</th>
                <th className="p-3">Value</th>
                <th className="p-3">Unrealized PnL</th>
                <th className="p-3">Tracked shares</th>
                <th className="p-3">History</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {sortedPositions.slice(0, 400).map((p) => {
                const pnl = p.unrealizedPnlTrackedUsdcRaw;
                const pnlClass = pnl ? (BigInt(pnl) >= 0n ? "text-green-400" : "text-red-400") : "text-gray-500";
                const historyHref = tokenHistoryHref(p.playerToken, p.tokenIdDec);

                  return (
                    <tr key={`${p.playerToken}:${p.tokenIdDec}`} className="text-gray-200">
                      <td className="p-3 whitespace-nowrap" title={p.playerToken}>
                        {getSportfunSportLabel(p.playerToken).toUpperCase()}
                      </td>
                      <td className="p-3 whitespace-nowrap">{renderTokenLabel(p.playerToken, p.tokenIdDec)}</td>
                      <td className="p-3 whitespace-nowrap">{formatShares(p.holdingSharesRaw)}</td>
                      <td className="p-3 whitespace-nowrap">{p.totals ? formatUsdc(p.totals.spentUsdcRaw, decimals) : "—"}</td>
                      <td className="p-3 whitespace-nowrap">{p.avgCostUsdcPerShareRaw ? formatUsdc(p.avgCostUsdcPerShareRaw, decimals) : "—"}</td>
                      <td className="p-3 whitespace-nowrap">{p.currentPriceUsdcPerShareRaw ? formatUsdc(p.currentPriceUsdcPerShareRaw, decimals) : "—"}</td>
                      <td className="p-3 whitespace-nowrap">{p.currentValueHoldingUsdcRaw ? formatUsdc(p.currentValueHoldingUsdcRaw, decimals) : "—"}</td>
                      <td className={`p-3 whitespace-nowrap ${pnlClass}`}>{pnl ? formatUsdc(pnl, decimals) : "—"}</td>
                      <td className="p-3 whitespace-nowrap text-gray-400">
                        {formatShares(p.trackedSharesRaw)}
                        {BigInt(p.trackedSharesRaw) !== BigInt(p.holdingSharesRaw) ? " (partial)" : ""}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {historyHref ? (
                          <Link className="text-blue-400 hover:underline" href={historyHref}>
                            View
                          </Link>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {sortedPositions.length === 0 ? (
                  <tr>
                    <td className="p-3 text-gray-400" colSpan={10}>
                      No positions.
                    </td>
                  </tr>
                ) : null}
                {sortedPositions.length > 400 ? (
                  <tr>
                    <td className="p-3 text-gray-400" colSpan={10}>
                      Showing top 400. Use CSV for full export.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">Holdings</h2>
        <p className="mt-1 text-sm text-gray-400">{data.assumptions.shareUnits}</p>
        {data.summary.scanIncomplete ? (
          <p className="mt-2 text-sm text-amber-300">Scan incomplete. Try raising maxPages.</p>
        ) : null}

        <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-gray-300">
              <tr>
                <th className="p-3">Player</th>
                <th className="p-3">Sport</th>
                <th className="p-3">Shares</th>
                <th className="p-3">Price (USDC/share)</th>
                <th className="p-3">Value (USDC)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {data.holdings.map((h) => (
                <tr key={`${h.contractAddress}:${h.tokenIdHex}`} className="text-gray-200">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {h.metadata?.imageUrl ? (
                        <Image
                          src={h.metadata.imageUrl}
                          alt={h.metadata.name ?? "Player"}
                          width={32}
                          height={32}
                          className="h-8 w-8 rounded-md object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-md bg-white/10" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-gray-100">
                          {h.metadata?.name ??
                            getSportfunNameOverride(h.contractAddress, h.tokenIdDec) ??
                            "Unknown"}
                        </div>
                        <div className="text-xs text-gray-500">#{h.tokenIdDec}</div>
                        {h.metadataError ? (
                          <div className="text-xs text-amber-300">metadata error</div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="p-3 whitespace-nowrap" title={h.contractAddress}>
                    {getSportfunSportLabel(h.contractAddress).toUpperCase()}
                  </td>
                  <td className="p-3 whitespace-nowrap text-gray-200">{formatShares(h.balanceRaw)}</td>
                  <td className="p-3 whitespace-nowrap text-gray-200">
                    {h.priceUsdcPerShareRaw ? formatUsdc(h.priceUsdcPerShareRaw, decimals) : "—"}
                  </td>
                  <td className="p-3 whitespace-nowrap text-gray-200">{h.valueUsdcRaw ? formatUsdc(h.valueUsdcRaw, decimals) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Activity (tx grouped)</h2>
            <p className="mt-1 text-xs text-gray-500">
              Showing {filteredActivity.length}
              {activityTokenFilter !== "all" ? ` of ${data.activity.length}` : ""} rows (auto-load on scroll).
            </p>
            <p className="mt-1 text-sm text-gray-400">{data.assumptions.usdc.note}</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-400">
              Athlete
              <select
                className="ml-2 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm text-gray-200"
                value={activityTokenFilter}
                onChange={(e) => setActivityTokenFilter(e.target.value)}
              >
                {activityTokenOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {activityTokenFilter !== "all" ? (() => {
              const parsed = splitTokenKey(activityTokenFilter);
              const href = parsed ? tokenHistoryHref(parsed.contractAddress, parsed.tokenIdDec) : null;
              if (!href) return null;
              return (
                <Link className="text-sm text-blue-400 hover:underline" href={href}>
                  Open history
                </Link>
              );
            })() : null}
          </div>
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-gray-300">
              <tr>
                <th className="p-3">Time</th>
                <th className="p-3">Kind</th>
                <th className="p-3">USDC delta</th>
                <th className="p-3">Decoded</th>
                <th className="p-3">Tx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredActivity.map((a) => (
                <tr key={a.hash} className="text-gray-200">
                  <td className="p-3 whitespace-nowrap text-gray-400">{a.timestamp ?? "—"}</td>
                  <td className="p-3 whitespace-nowrap">
                    {a.kind && a.kind !== "unknown" ? (
                      <span className={a.kind === "buy" ? "text-green-400" : "text-red-400"}>{a.kind.toUpperCase()}</span>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <span className={BigInt(a.usdcDeltaRaw) >= 0n ? "text-green-400" : "text-red-400"}>
                      {formatUsdc(a.usdcDeltaRaw, decimals)}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1 text-xs">
                      {a.decoded?.trades?.slice(0, 3).map((t, idx) => (
                        <div key={idx} className="text-gray-200">
                          <span className={t.kind === "buy" ? "text-green-400" : "text-red-400"}>{t.kind.toUpperCase()}</span>{" "}
                          {formatTokenLabel(t.playerToken, t.tokenIdDec)} · shares {formatShares(t.shareAmountRaw)} · net {formatUsdc(t.currencyRaw, decimals)} · fee {formatUsdc(t.feeRaw, decimals)}
                        </div>
                      ))}
                      {a.decoded?.promotions?.slice(0, 2).map((p, idx) => (
                        <div key={`p-${idx}`} className="text-amber-300">
                          PROMO {formatTokenLabel(p.playerToken, p.tokenIdDec)} · shares {formatShares(p.shareAmountRaw)}
                        </div>
                      ))}
                      {a.decoded?.trades && a.decoded.trades.length > 3 ? (
                        <div className="text-gray-500">+{a.decoded.trades.length - 3} more trades…</div>
                      ) : null}
                    </div>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <div className="flex flex-col">
                      <a className="text-blue-400 hover:underline" href={`/sportfun/tx/${a.hash}`}>
                        Inspect
                      </a>
                      <a className="text-xs text-gray-500 hover:underline" href={`https://basescan.org/tx/${a.hash}`} target="_blank" rel="noreferrer">
                        Basescan
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredActivity.length === 0 ? (
                <tr>
                  <td className="p-3 text-gray-400" colSpan={5}>
                    No activity for selected athlete.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {data.debug?.shareDeltaMismatchSamples?.length ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-white">Mismatch diagnostics</h2>
          <p className="mt-1 text-sm text-gray-400">
            ERC-1155 deltas that were not fully explained by decoded trades/promotions.
          </p>

          <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-left text-gray-300">
                <tr>
                  <th className="p-3">Tx</th>
                  <th className="p-3">Sport</th>
                  <th className="p-3">Player</th>
                  <th className="p-3">Expected Δ</th>
                  <th className="p-3">Decoded Δ</th>
                  <th className="p-3">Residual Δ</th>
                  <th className="p-3">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {data.debug.shareDeltaMismatchSamples.map((s, idx) => (
                  <tr key={`${s.hash}-${idx}`} className="text-gray-200">
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex flex-col">
                        <a className="text-blue-400 hover:underline" href={`/sportfun/tx/${s.hash}`}>
                          Inspect
                        </a>
                        <a className="text-xs text-gray-500 hover:underline" href={`https://basescan.org/tx/${s.hash}`} target="_blank" rel="noreferrer">
                          {shortenAddress(s.hash)}
                        </a>
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap" title={s.contractAddress}>
                      {getSportfunSportLabel(s.contractAddress).toUpperCase()}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {renderTokenLabel(s.contractAddress, s.tokenIdDec)}
                    </td>
                    <td className="p-3 whitespace-nowrap">{formatShares(s.expectedDeltaRaw)}</td>
                    <td className="p-3 whitespace-nowrap">{formatShares(s.decodedDeltaRaw)}</td>
                    <td className="p-3 whitespace-nowrap">{formatShares(s.residualDeltaRaw)}</td>
                    <td className="p-3 whitespace-nowrap text-gray-400">{s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data.analytics?.note ? (
        <section className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-300">PnL notes</div>
          <p className="mt-2 text-sm text-gray-400">{data.analytics.note}</p>
        </section>
      ) : null}

      <div ref={sentinelRef} className="h-8" />
    </main>
  );
}
