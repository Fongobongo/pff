"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shortenAddress } from "@/lib/format";
import { getSportfunNameOverride, getSportfunSportLabel } from "@/lib/sportfunNames";

type SortKey = "value" | "pnl" | "spent" | "shares";
type ActivityKindFilter = "all" | "buy" | "sell" | "scam";
type DashboardMode = "sportfun" | "nfl";
type FreeTokenMode = "include" | "exclude";

type SportfunPortfolioSnapshot = {
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
    includeMetadata?: boolean;
    metadataLimit?: number;
  };
  summary: {
    erc1155TransferCount: number;
    sportfunErc1155TransferCount: number;
    contractCount: number;
    holdingCount: number;
    activityCount: number;
    decodedTradeCount?: number;
    decodedPromotionCount?: number;
    decodedContractRenewalCount?: number;
    decodedPackOpenCount?: number;
    funTransferCount?: number;
    decodedDepositCount?: number;
    decodedScamCount?: number;
    shareDeltaMismatchCount?: number;
    shareDeltaMismatchTxCount?: number;
    activityCountTotal?: number;
    activityCountReturned?: number;
    activityTruncated?: boolean;
    nextActivityCursor?: number;
    activityCursor?: number;
    scanIncomplete?: boolean;
    scan?: unknown;
    scanStart?: {
      fromBlock?: string;
      fromDate?: string;
    };
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
    unrealizedPnlExcludingPromotionsUsdcRaw?: string;
    unrealizedPnlExcludingFreeUsdcRaw?: string;
    totalCostBasisUsdcRaw: string;
    currentValueUsdcRaw: string;
    currentValueExcludingPromotionsUsdcRaw?: string;
    currentValueExcludingFreeUsdcRaw?: string;
    currentValueAllHoldingsUsdcRaw?: string;
    holdingsPricedCount?: number;
    costBasisUnknownTradeCount: number;
    contractRenewalSpentUsdcRaw?: string;
    contractRenewalAppliedCount?: number;
    contractRenewalUnresolvedCount?: number;
    contractRenewalNoSharesCount?: number;
    contractRenewalUnsupportedPaymentCount?: number;
    packOpenFreeSharesRaw?: string;
    depositToGameWalletUsdcRaw?: string;
    depositFromGameWalletUsdcRaw?: string;
    funIncomingRaw?: string;
    funOutgoingRaw?: string;
    positionsByToken?: Array<{
      playerToken: string;
      tokenIdDec: string;
      playerName?: string;

      holdingSharesRaw: string;
      trackedSharesRaw: string;
      promoSharesHeldRaw?: string;
      freeSharesHeldRaw?: string;
      trackedSharesExcludingPromotionsRaw?: string;
      trackedSharesExcludingFreeRaw?: string;

      costBasisUsdcRaw: string;
      avgCostUsdcPerShareRaw?: string;

      currentPriceUsdcPerShareRaw?: string;
      currentValueHoldingUsdcRaw?: string;
      currentValueTrackedUsdcRaw?: string;
      currentValueTrackedExcludingPromotionsUsdcRaw?: string;
      currentValueTrackedExcludingFreeUsdcRaw?: string;

      unrealizedPnlTrackedUsdcRaw?: string;
      unrealizedPnlTrackedExcludingPromotionsUsdcRaw?: string;
      unrealizedPnlTrackedExcludingFreeUsdcRaw?: string;
      averageTpPerTournament?: number;
      tournamentsCount?: number;
      tournamentTpTotal?: number;
      tpLastTournamentAt?: string;

      totals?: {
        boughtSharesRaw: string;
        soldSharesRaw: string;
        spentUsdcRaw: string;
        receivedUsdcRaw: string;
        freeSharesInRaw: string;
        freeEvents: number;
        promotionSharesInRaw?: string;
        promotionEvents?: number;
        packOpenSharesInRaw?: string;
        packOpenEvents?: number;
        contractRenewalSpentUsdcRaw?: string;
        contractRenewalEvents?: number;
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
    kind?: "buy" | "sell" | "scam" | "unknown";
    usdcDeltaRaw: string;
    funDeltaRaw?: string;
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
        walletCurrencyDeltaEventRaw?: string;
        walletCurrencyDeltaSource?: "event" | "receipt_reconciled";
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
      contractRenewals?: Array<{
        kind: "contract_renewal";
        renewalContract: string;
        playerToken?: string;
        tokenIdDec: string;
        amountPaidRaw: string;
        paymentToken: string;
        matchCountRaw: string;
      }>;
      packOpens?: Array<{
        kind: "pack_open";
        packContract?: string;
        opener?: string;
        selector?: string;
        playerToken: string;
        tokenIdDec: string;
        shareAmountRaw: string;
      }>;
      deposits?: Array<{
        kind: "deposit";
        direction: "to_game_wallet" | "from_game_wallet";
        counterparty: string;
        amountRaw: string;
        paymentToken: string;
      }>;
      scams?: Array<{
        kind: "scam";
        category: "erc20" | "erc721" | "erc1155";
        counterparty: string;
        contractAddress?: string;
        tokenIdHex?: string;
        tokenIdDec?: string;
        amountRaw?: string;
        reason: string;
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

type SportfunPortfolioStatusResponse = {
  status?: "pending" | "running" | "completed" | "failed";
  jobId?: string;
  error?: string;
  snapshot?: SportfunPortfolioSnapshot;
};

type SportfunPortfolioResponse = SportfunPortfolioSnapshot & SportfunPortfolioStatusResponse;

type SportfunPortfolioApiResponse = SportfunPortfolioResponse | SportfunPortfolioStatusResponse;

type ActivityItem = SportfunPortfolioSnapshot["activity"][number];
type PortfolioStatus = NonNullable<SportfunPortfolioStatusResponse["status"]>;
type DashboardProps = {
  address: string;
  mode?: DashboardMode;
  lockedSportFilter?: "nfl" | "soccer" | null;
  showGlobalLinks?: boolean;
};

type SportfunMarketTokenLite = {
  tokenIdDec: string;
  position?: string;
  team?: string;
  attributes?: unknown;
};

type SportfunMarketTelemetry = {
  asOf?: string;
  totalTokens: number;
  metadataSourceCounts: {
    onchainOnly: number;
    fallbackOnly: number;
    hybrid: number;
    overrideOnly: number;
    unresolved: number;
  };
  fallbackFeed: {
    source: string;
    staleAgeMs?: number;
  };
};

type SportfunMarketSnapshotLite = {
  asOf?: string;
  tokens: SportfunMarketTokenLite[];
  stats?: {
    metadataSourceCounts?: Partial<SportfunMarketTelemetry["metadataSourceCounts"]>;
    fallbackFeed?: Partial<SportfunMarketTelemetry["fallbackFeed"]>;
  };
};

function extractAttributeValue(attributes: unknown, matchKey: (key: string) => boolean): unknown {
  if (!attributes) return undefined;
  if (Array.isArray(attributes)) {
    for (const entry of attributes) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const key = String(
        record.trait_type ?? record.traitType ?? record.name ?? record.key ?? ""
      ).toLowerCase();
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

function extractNflPosition(attributes: unknown): string | undefined {
  const raw = extractAttributeValue(attributes, (key) => key.includes("position") || key === "pos");
  if (typeof raw === "string" && raw.trim()) return raw.trim().toUpperCase();
  return undefined;
}

function extractNflTeam(attributes: unknown): string | undefined {
  const raw = extractAttributeValue(attributes, (key) => key.includes("team") || key.includes("club"));
  if (typeof raw === "string" && raw.trim()) return raw.trim().toUpperCase();
  return undefined;
}

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

  if (activity.decoded?.contractRenewals) {
    for (const renewal of activity.decoded.contractRenewals) {
      if (makeTokenKey(renewal.playerToken, renewal.tokenIdDec) === keyLc) return true;
    }
  }

  if (activity.decoded?.packOpens) {
    for (const pack of activity.decoded.packOpens) {
      if (makeTokenKey(pack.playerToken, pack.tokenIdDec) === keyLc) return true;
    }
  }

  return false;
}

function activityHasKind(activity: ActivityItem, kind: ActivityKindFilter): boolean {
  if (kind === "all") return true;
  if (kind === "scam") return Boolean(activity.decoded?.scams?.length);
  if (activity.kind === kind) return true;
  if (activity.decoded?.trades?.some((trade) => trade.kind === kind)) return true;
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

function hasValue(raw: string | undefined | null): raw is string {
  return raw !== undefined && raw !== null;
}

function formatAgeMs(ms?: number): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "n/a";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatTpAverage(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

export default function SportfunPortfolioDashboard({
  address,
  mode = "sportfun",
  lockedSportFilter = null,
  showGlobalLinks = true,
}: DashboardProps) {
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
  const [sportFilter, setSportFilter] = useState<string>(lockedSportFilter ?? "all");
  const [tokenQuery, setTokenQuery] = useState("");
  const [freeTokenMode, setFreeTokenMode] = useState<FreeTokenMode>("include");
  const [activityTokenFilter, setActivityTokenFilter] = useState<string>("all");
  const [activityKindFilter, setActivityKindFilter] = useState<ActivityKindFilter>("all");
  const [fullScanLoading, setFullScanLoading] = useState(false);
  const [fullScanError, setFullScanError] = useState<string | null>(null);
  const [fullScanAttempts, setFullScanAttempts] = useState<number[]>([]);
  const [fullScanStatus, setFullScanStatus] = useState<PortfolioStatus | null>(null);
  const [fullScanJobId, setFullScanJobId] = useState<string | null>(null);
  const [nflTokenMeta, setNflTokenMeta] = useState<Map<string, { position?: string; team?: string }>>(
    new Map()
  );
  const [nflMarketTelemetry, setNflMarketTelemetry] = useState<SportfunMarketTelemetry | null>(null);

  const decimals = data?.assumptions.usdc.decimals ?? 6;
  const tokenLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const holding of data?.holdings ?? []) {
      const name =
        holding.metadata?.name?.trim() ??
        getSportfunNameOverride(holding.contractAddress, holding.tokenIdDec);
      if (name) {
        map.set(`${holding.contractAddress.toLowerCase()}:${holding.tokenIdDec}`, name);
      }
    }
    for (const position of data?.analytics?.positionsByToken ?? []) {
      const name = position.playerName?.trim();
      if (!name) continue;
      const key = `${position.playerToken.toLowerCase()}:${position.tokenIdDec}`;
      if (!map.has(key)) map.set(key, name);
    }
    return map;
  }, [data?.analytics?.positionsByToken, data?.holdings]);

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
      mode?: "sync" | "async";
      jobId?: string;
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
      if (params.mode) query.set("mode", params.mode);
      if (params.jobId) query.set("jobId", params.jobId);
      return `/api/sportfun/portfolio/${address}?${query.toString()}`;
    };
  }, [address]);

  const fullScanParams = useMemo(
    () => ({
      scanMode: "full" as const,
      maxPages: 200,
      maxActivity: 200,
      includeTrades: true,
      includePrices: true,
      includeMetadata: true,
      includeUri: true,
    }),
    []
  );

  const applySnapshot = useCallback((next: SportfunPortfolioSnapshot) => {
    setData(next);
    const cursor = next.summary.nextActivityCursor;
    setActivityCursor(cursor ?? null);
    setActivityDone(!cursor);
  }, []);

  const applyApiResponse = useCallback((next: SportfunPortfolioApiResponse) => {
    const hasStatus = "status" in next && Boolean(next.status);
    if (hasStatus && next.status) {
      setFullScanStatus(next.status);
      if (next.status === "failed" && next.error) {
        setFullScanError(next.error);
      }
      if (next.status === "failed") {
        setLoading(false);
      }
    }
    if ("jobId" in next && next.jobId) {
      setFullScanJobId(next.jobId);
    }
    if ("chain" in next) {
      if (!hasStatus) {
        setFullScanStatus("completed");
      }
      applySnapshot(next);
      setLoading(false);
      return;
    }
    if ("snapshot" in next && next.snapshot) {
      applySnapshot(next.snapshot);
      setLoading(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    if (!lockedSportFilter) return;
    setSportFilter(lockedSportFilter);
  }, [lockedSportFilter]);

  useEffect(() => {
    if (mode !== "nfl") {
      setNflTokenMeta(new Map());
      setNflMarketTelemetry(null);
      return;
    }

    let cancelled = false;

    getJson<SportfunMarketSnapshotLite>(
      `/api/sportfun/market?sport=nfl&windowHours=24&trendDays=30&maxTokens=1000&cacheBust=${Date.now()}`,
      25000
    )
      .then((snapshot) => {
        if (cancelled) return;
        const next = new Map<string, { position?: string; team?: string }>();
        for (const token of snapshot.tokens ?? []) {
          next.set(token.tokenIdDec, {
            position: token.position?.toUpperCase() ?? extractNflPosition(token.attributes),
            team: token.team?.toUpperCase() ?? extractNflTeam(token.attributes),
          });
        }
        setNflTokenMeta(next);
        const counts = snapshot.stats?.metadataSourceCounts;
        const feed = snapshot.stats?.fallbackFeed;
        setNflMarketTelemetry({
          asOf: snapshot.asOf,
          totalTokens: Array.isArray(snapshot.tokens) ? snapshot.tokens.length : 0,
          metadataSourceCounts: {
            onchainOnly: Number(counts?.onchainOnly ?? 0),
            fallbackOnly: Number(counts?.fallbackOnly ?? 0),
            hybrid: Number(counts?.hybrid ?? 0),
            overrideOnly: Number(counts?.overrideOnly ?? 0),
            unresolved: Number(counts?.unresolved ?? 0),
          },
          fallbackFeed: {
            source: typeof feed?.source === "string" ? feed.source : "n/a",
            staleAgeMs: typeof feed?.staleAgeMs === "number" ? feed.staleAgeMs : undefined,
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        setNflTokenMeta(new Map());
        setNflMarketTelemetry(null);
      });

    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      setAttemptPages([fullScanParams.maxPages]);
      setActivityCursor(null);
      setActivityDone(false);
      setActivityTokenFilter("all");
      setActivityKindFilter("all");
      setFullScanAttempts([fullScanParams.maxPages]);
      setFullScanError(null);
      setFullScanStatus("pending");
      setFullScanJobId(null);

      const next = await getJson<SportfunPortfolioApiResponse>(
        buildRequestUrl({ ...fullScanParams, mode: "async" }),
        45000
      );
      if (cancelled) return;
      applyApiResponse(next);
    }

    run().catch((e: unknown) => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : String(e));
      setFullScanStatus("failed");
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [applyApiResponse, buildRequestUrl, fullScanParams]);

  useEffect(() => {
    if (!fullScanJobId) return;
    if (!fullScanStatus || fullScanStatus === "completed" || fullScanStatus === "failed") return;

    let cancelled = false;

    const poll = async () => {
      try {
        const next = await getJson<SportfunPortfolioApiResponse>(
          buildRequestUrl({ ...fullScanParams, mode: "async", jobId: fullScanJobId }),
          20000
        );
        if (cancelled) return;
        applyApiResponse(next);
      } catch (err: unknown) {
        if (cancelled) return;
        setFullScanError(err instanceof Error ? err.message : String(err));
      }
    };

    const interval = setInterval(poll, 5000);
    poll();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [applyApiResponse, buildRequestUrl, fullScanJobId, fullScanParams, fullScanStatus]);

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
            includePrices: false,
            includeMetadata: false,
            includeUri: false,
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
  }, [activityCursor, activityDone, activityLoading, data, buildRequestUrl]);

  const positions = useMemo(() => data?.analytics?.positionsByToken ?? [], [data?.analytics?.positionsByToken]);
  const normalizedTokenQuery = tokenQuery.trim().toLowerCase();

  const getPositionPnlRaw = useCallback(
    (position: (typeof positions)[number]): string => {
      if (freeTokenMode === "exclude") {
        return (
          position.unrealizedPnlTrackedExcludingFreeUsdcRaw ??
          position.unrealizedPnlTrackedExcludingPromotionsUsdcRaw ??
          position.unrealizedPnlTrackedUsdcRaw ??
          "0"
        );
      }
      return position.unrealizedPnlTrackedUsdcRaw ?? "0";
    },
    [freeTokenMode]
  );

  const getPositionValueRaw = useCallback(
    (position: (typeof positions)[number]): string => {
      if (freeTokenMode === "exclude") {
        return (
          position.currentValueTrackedExcludingFreeUsdcRaw ??
          position.currentValueTrackedExcludingPromotionsUsdcRaw ??
          position.currentValueTrackedUsdcRaw ??
          position.currentValueHoldingUsdcRaw ??
          "0"
        );
      }
      return position.currentValueHoldingUsdcRaw ?? "0";
    },
    [freeTokenMode]
  );

  const filteredPositions = useMemo(() => {
    return positions.filter((p) => {
      if (sportFilter !== "all" && getSportfunSportLabel(p.playerToken) !== sportFilter) {
        return false;
      }

      if (freeTokenMode === "exclude") {
        const freeSharesHeld = BigInt(p.freeSharesHeldRaw ?? p.promoSharesHeldRaw ?? "0");
        const trackedExFree = BigInt(
          p.trackedSharesExcludingFreeRaw ?? p.trackedSharesExcludingPromotionsRaw ?? p.trackedSharesRaw
        );
        if (freeSharesHeld > 0n && trackedExFree === 0n) return false;
      }

      if (normalizedTokenQuery) {
        const label = getTokenLabel(p.playerToken, p.tokenIdDec).toLowerCase();
        if (!label.includes(normalizedTokenQuery) && !p.tokenIdDec.toLowerCase().includes(normalizedTokenQuery)) {
          return false;
        }
      }

      return true;
    });
  }, [positions, sportFilter, freeTokenMode, normalizedTokenQuery, getTokenLabel]);

  const sortedPositions = useMemo(() => {
    return [...filteredPositions].sort((a, b) => {
      const av = (s: string | undefined) => BigInt(s ?? "0");

      const keyToValue = (p: (typeof positions)[number]) => {
        switch (sortKey) {
          case "spent":
            return av(p.totals?.spentUsdcRaw);
          case "pnl":
            return av(getPositionPnlRaw(p));
          case "shares":
            return av(p.holdingSharesRaw);
          case "value":
          default:
            return av(getPositionValueRaw(p));
        }
      };

      const left = keyToValue(a);
      const right = keyToValue(b);

      if (left === right) return 0;
      const cmp = right > left ? 1 : -1;
      return sortDir === "desc" ? cmp : -cmp;
    });
  }, [filteredPositions, sortDir, sortKey, getPositionPnlRaw, getPositionValueRaw]);

  const filteredUnrealizedPnlRaw = useMemo(() => {
    return filteredPositions.reduce((acc, position) => acc + BigInt(getPositionPnlRaw(position)), 0n).toString(10);
  }, [filteredPositions, getPositionPnlRaw]);

  const filteredCurrentValueRaw = useMemo(() => {
    return filteredPositions.reduce((acc, position) => acc + BigInt(getPositionValueRaw(position)), 0n).toString(10);
  }, [filteredPositions, getPositionValueRaw]);

  const nflExposure = useMemo(() => {
    if (mode !== "nfl") {
      return {
        totalValueRaw: 0n,
        byPosition: [] as Array<{ label: string; valueRaw: bigint; share: number }>,
        byTeam: [] as Array<{ label: string; valueRaw: bigint; share: number }>,
      };
    }

    const byPosition = new Map<string, bigint>();
    const byTeam = new Map<string, bigint>();
    let totalValueRaw = 0n;

    for (const position of sortedPositions) {
      const valueRaw = BigInt(getPositionValueRaw(position));
      if (valueRaw <= 0n) continue;

      totalValueRaw += valueRaw;
      const meta = nflTokenMeta.get(position.tokenIdDec);
      const posLabel = (meta?.position ?? "UNK").toUpperCase();
      const teamLabel = (meta?.team ?? "UNK").toUpperCase();

      byPosition.set(posLabel, (byPosition.get(posLabel) ?? 0n) + valueRaw);
      byTeam.set(teamLabel, (byTeam.get(teamLabel) ?? 0n) + valueRaw);
    }

    const toRows = (map: Map<string, bigint>) =>
      Array.from(map.entries())
        .sort((a, b) => (b[1] > a[1] ? 1 : -1))
        .map(([label, valueRaw]) => ({
          label,
          valueRaw,
          share: totalValueRaw > 0n ? (Number(valueRaw) / Number(totalValueRaw)) * 100 : 0,
        }));

    return {
      totalValueRaw,
      byPosition: toRows(byPosition),
      byTeam: toRows(byTeam),
    };
  }, [mode, nflTokenMeta, sortedPositions, getPositionValueRaw]);

  const nflMarketCoverage = useMemo(() => {
    if (!nflMarketTelemetry) {
      return { resolved: 0, total: 0, resolvedPct: 0 };
    }
    const counts = nflMarketTelemetry.metadataSourceCounts;
    const resolved = counts.onchainOnly + counts.fallbackOnly + counts.hybrid + counts.overrideOnly;
    const total = nflMarketTelemetry.totalTokens;
    return {
      resolved,
      total,
      resolvedPct: total > 0 ? (resolved / total) * 100 : 0,
    };
  }, [nflMarketTelemetry]);

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
      for (const renewal of a.decoded?.contractRenewals ?? []) add(renewal.playerToken, renewal.tokenIdDec);
      for (const pack of a.decoded?.packOpens ?? []) add(pack.playerToken, pack.tokenIdDec);
    }

    return [{ value: "all", label: "All athletes" }, ...Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))];
  }, [data?.activity, data?.holdings, positions, getTokenLabel]);

  const filteredActivity = useMemo(() => {
    if (!data) return [] as ActivityItem[];

    return data.activity.filter((activity) => {
      const tokenMatches =
        activityTokenFilter === "all" || activityHasToken(activity, activityTokenFilter);
      if (!tokenMatches) return false;
      return activityHasKind(activity, activityKindFilter);
    });
  }, [activityKindFilter, activityTokenFilter, data]);

  const loadingTextClass = mode === "nfl" ? "text-zinc-900 dark:text-zinc-100" : "text-white";
  const subtextClass = mode === "nfl" ? "text-zinc-600 dark:text-zinc-400" : "text-gray-400";
  const emptyTextClass = mode === "nfl" ? "text-zinc-500 dark:text-zinc-400" : "text-gray-400";

  if (loading && !data) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <div className={loadingTextClass}>Loading full scan…</div>
        <div className={`mt-2 text-sm ${subtextClass}`}>Address: {address}</div>
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
        <div className={emptyTextClass}>No data.</div>
      </main>
    );
  }

  async function runFullScan() {
    setFullScanLoading(true);
    setFullScanError(null);
    setFullScanAttempts([fullScanParams.maxPages]);
    setFullScanStatus("pending");
    setFullScanJobId(null);
    try {
      const next = await getJson<SportfunPortfolioApiResponse>(
        buildRequestUrl({ ...fullScanParams, mode: "async" }),
        20000
      );
      applyApiResponse(next);
    } catch (err: unknown) {
      setFullScanError(err instanceof Error ? err.message : String(err));
      setFullScanStatus("failed");
    } finally {
      setFullScanLoading(false);
    }
  }

  async function runMetadataScan() {
    setFullScanLoading(true);
    setFullScanError(null);
    const current = data;
    if (!current) {
      setFullScanError("No data loaded yet.");
      setFullScanLoading(false);
      return;
    }
    try {
      const next = await getJson<SportfunPortfolioResponse>(
        buildRequestUrl({
          scanMode: current.query?.scanMode ?? "default",
          maxPages: current.query?.maxPages ?? 10,
          maxActivity: current.query?.maxActivity ?? 150,
          includeTrades: false,
          includePrices: false,
          includeMetadata: true,
          includeUri: true,
          metadataLimit: 25,
        }),
        25000
      );
      applySnapshot(next);
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
      "averageTpPerTournament",
      "tpTournamentsCount",
      "tpTournamentTotal",
      "holdingShares",
      "spentUsdc",
      "avgCostUsdcPerShare",
      "currentPriceUsdcPerShare",
      "currentValueHoldingUsdc",
      "currentValueTrackedExcludingFreeUsdc",
      "currentValueTrackedExcludingPromotionsUsdc",
      "unrealizedPnlTrackedUsdc",
      "unrealizedPnlTrackedExcludingFreeUsdc",
      "unrealizedPnlTrackedExcludingPromotionsUsdc",
      "trackedShares",
      "freeSharesHeld",
      "promoSharesHeld",
      "trackedSharesExcludingFree",
      "trackedSharesExcludingPromotions",
      "freeSharesIn",
      "freeEvents",
      "packOpenSharesIn",
      "packOpenEvents",
      "promotionSharesIn",
      "promotionEvents",
      "contractRenewalSpentUsdc",
      "contractRenewalEvents",
    ];

    const rows = sortedPositions.map((p) => [
      (() => {
        const label = getTokenLabel(p.playerToken, p.tokenIdDec);
        return label === p.tokenIdDec ? "" : label;
      })(),
      p.playerToken,
      p.tokenIdDec,
      p.averageTpPerTournament ?? "",
      p.tournamentsCount ?? "",
      p.tournamentTpTotal ?? "",
      p.holdingSharesRaw,
      p.totals?.spentUsdcRaw ?? "0",
      p.avgCostUsdcPerShareRaw ?? "",
      p.currentPriceUsdcPerShareRaw ?? "",
      p.currentValueHoldingUsdcRaw ?? "",
      p.currentValueTrackedExcludingFreeUsdcRaw ?? "",
      p.currentValueTrackedExcludingPromotionsUsdcRaw ?? "",
      p.unrealizedPnlTrackedUsdcRaw ?? "",
      p.unrealizedPnlTrackedExcludingFreeUsdcRaw ?? "",
      p.unrealizedPnlTrackedExcludingPromotionsUsdcRaw ?? "",
      p.trackedSharesRaw,
      p.freeSharesHeldRaw ?? "0",
      p.promoSharesHeldRaw ?? "0",
      p.trackedSharesExcludingFreeRaw ?? p.trackedSharesRaw,
      p.trackedSharesExcludingPromotionsRaw ?? p.trackedSharesRaw,
      p.totals?.freeSharesInRaw ?? "0",
      String(p.totals?.freeEvents ?? 0),
      p.totals?.packOpenSharesInRaw ?? "0",
      String(p.totals?.packOpenEvents ?? 0),
      p.totals?.promotionSharesInRaw ?? "0",
      String(p.totals?.promotionEvents ?? 0),
      p.totals?.contractRenewalSpentUsdcRaw ?? "0",
      String(p.totals?.contractRenewalEvents ?? 0),
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

  const availableSports = Array.from(
    new Set(positions.map((position) => getSportfunSportLabel(position.playerToken)))
  )
    .filter((sport) => sport !== "unknown")
    .sort();

  const contractOptions = lockedSportFilter
    ? [{ value: lockedSportFilter, label: lockedSportFilter.toUpperCase() }]
    : [
        { value: "all", label: "All" },
        ...availableSports.map((sport) => ({ value: sport, label: sport.toUpperCase() })),
      ];

  const fullScanStatusLabel =
    fullScanStatus === "failed"
      ? "failed"
      : fullScanStatus === "completed"
        ? "completed"
        : fullScanStatus
          ? "processing"
          : null;
  const fullScanBusy = fullScanLoading || fullScanStatus === "pending" || fullScanStatus === "running";
  const titleText = mode === "nfl" ? "NFL portfolio" : "Sport.fun portfolio";
  const cardTextMain = mode === "nfl" ? "text-zinc-900 dark:text-zinc-100" : "text-white";
  const cardTextMuted = mode === "nfl" ? "text-zinc-600 dark:text-zinc-400" : "text-gray-400";
  const cardTextMutedStrong = mode === "nfl" ? "text-zinc-500 dark:text-zinc-400" : "text-gray-500";
  const cardBorder = mode === "nfl" ? "border-black/10 bg-white dark:border-white/10 dark:bg-white/5" : "border-white/10 bg-white/5";
  const tableHead = mode === "nfl" ? "bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300" : "bg-white/5 text-gray-300";
  const tableBody = mode === "nfl" ? "divide-black/10 dark:divide-white/10" : "divide-white/10";
  const rowText = mode === "nfl" ? "text-zinc-700 dark:text-zinc-200" : "text-gray-200";
  const tableBorder = mode === "nfl" ? "border-black/10 dark:border-white/10" : "border-white/10";
  const portfolioUnrealizedRaw =
    freeTokenMode === "exclude"
      ? data.analytics?.unrealizedPnlExcludingFreeUsdcRaw ??
        data.analytics?.unrealizedPnlExcludingPromotionsUsdcRaw ??
        data.analytics?.unrealizedPnlUsdcRaw ??
        "0"
      : data.analytics?.unrealizedPnlUsdcRaw ?? "0";

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-semibold ${cardTextMain}`}>{titleText}</h1>
          <p className={`text-sm ${cardTextMuted}`}>{address}</p>
          <p className={`mt-1 text-xs ${cardTextMutedStrong}`}>
            Auto-scan attempts: {attemptPages.length ? attemptPages.join(" → ") : "—"}
            {data.summary.scanIncomplete ? " (still incomplete)" : ""}
            {fullScanAttempts.length ? ` · full scan: ${fullScanAttempts.join(" → ")}` : ""}
            {fullScanStatusLabel ? ` · full scan ${fullScanStatusLabel}` : ""}
            {fullScanLoading && !fullScanStatusLabel ? " · starting full scan…" : ""}
          </p>
          {data.summary.scanStart?.fromDate ? (
            <p className={`mt-1 text-xs ${cardTextMutedStrong}`}>
              Scan start: {new Date(data.summary.scanStart.fromDate).toLocaleDateString()} · block{" "}
              {data.summary.scanStart.fromBlock ?? "—"}
            </p>
          ) : null}
          {fullScanStatus ? (
            <p className="mt-1 text-xs text-amber-400">
              Full scan status: {fullScanStatus === "failed" ? "failed" : fullScanStatus === "completed" ? "completed" : "processing"}
              {fullScanJobId ? ` · job ${fullScanJobId.slice(0, 8)}…` : ""}
            </p>
          ) : null}
          {fullScanError ? <p className="mt-1 text-xs text-rose-400">Full scan failed: {fullScanError}</p> : null}
        </div>
        <div className="flex items-center gap-4">
          <button
            className={`rounded-md border px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-60 ${
              mode === "nfl"
                ? "border-black/10 bg-black/5 text-zinc-900 hover:bg-black/10 dark:border-white/10 dark:bg-white/10 dark:text-zinc-100 dark:hover:bg-white/15"
                : "border-white/10 bg-white/10 text-white hover:bg-white/15"
            }`}
            onClick={runFullScan}
            disabled={fullScanBusy}
          >
            {fullScanBusy ? "Full scan processing…" : "Run full scan"}
          </button>
          <button
            className={`rounded-md border px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-60 ${
              mode === "nfl"
                ? "border-black/10 bg-black/5 text-zinc-900 hover:bg-black/10 dark:border-white/10 dark:bg-white/10 dark:text-zinc-100 dark:hover:bg-white/15"
                : "border-white/10 bg-white/10 text-white hover:bg-white/15"
            }`}
            onClick={runMetadataScan}
            disabled={fullScanLoading}
          >
            {fullScanLoading ? "Loading metadata…" : "Load metadata (top 25)"}
          </button>
          {showGlobalLinks ? (
            <>
              <Link className="text-sm text-blue-400 hover:underline" href={`/sportfun/prices`}>
                Prices
              </Link>
              <Link className="text-sm text-blue-400 hover:underline" href={`/base/${address}`}>
                Base wallet
              </Link>
              <Link className="text-sm text-blue-400 hover:underline" href={`/`}>
                Home
              </Link>
            </>
          ) : null}
        </div>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className={`rounded-xl border p-4 ${cardBorder}`}>
          <div className={`text-sm ${cardTextMuted}`}>Holdings</div>
          <div className={`mt-2 text-xl ${cardTextMain}`}>{data.summary.holdingCount}</div>
          <p className={`mt-1 text-xs ${cardTextMutedStrong}`}>Non-zero balances only.</p>
        </div>
        <div className={`rounded-xl border p-4 ${cardBorder}`}>
          <div className={`text-sm ${cardTextMuted}`}>ERC-1155 transfers (filtered)</div>
          <div className={`mt-2 text-xl ${cardTextMain}`}>{data.summary.sportfunErc1155TransferCount}</div>
          <p className={`mt-1 text-xs ${cardTextMutedStrong}`}>Known Sport.fun contracts.</p>
        </div>
        <div className={`rounded-xl border p-4 ${cardBorder}`}>
          <div className={`text-sm ${cardTextMuted}`}>Tx activity</div>
          <div className={`mt-2 text-xl ${cardTextMain}`}>{data.summary.activityCount}</div>
          <p className={`mt-1 text-xs ${cardTextMutedStrong}`}>
            Showing {data.summary.activityCountReturned ?? data.activity.length}
            {data.summary.activityTruncated ? "/" + (data.summary.activityCountTotal ?? data.summary.activityCount) : ""}.
            {activityLoading ? " Loading more…" : activityDone ? " End of activity." : " Scroll for more."}
          </p>
        </div>
        <div className={`rounded-xl border p-4 ${cardBorder}`}>
          <div className={`text-sm ${cardTextMuted}`}>Decoded events</div>
          <div className={`mt-2 text-xl ${cardTextMain}`}>{data.summary.decodedTradeCount ?? 0}</div>
          <p className={`mt-1 text-xs ${cardTextMutedStrong}`}>
            FDFPairV2 events
            {data.summary.decodedPromotionCount !== undefined ? ` · promotions ${data.summary.decodedPromotionCount}` : ""}
            {data.summary.decodedContractRenewalCount !== undefined ? ` · renewals ${data.summary.decodedContractRenewalCount}` : ""}
            {data.summary.decodedPackOpenCount !== undefined ? ` · packs ${data.summary.decodedPackOpenCount}` : ""}
            {data.summary.funTransferCount !== undefined ? ` · fun ${data.summary.funTransferCount}` : ""}
            {data.summary.decodedDepositCount !== undefined ? ` · deposits ${data.summary.decodedDepositCount}` : ""}
            {data.summary.decodedScamCount !== undefined ? ` · scams ${data.summary.decodedScamCount}` : ""}
            {data.summary.shareDeltaMismatchTxCount ? ` · reconciled ${data.summary.shareDeltaMismatchTxCount} tx` : ""}.
          </p>
        </div>
      </section>

      {data.analytics ? (
        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className={`rounded-xl border p-4 ${cardBorder}`}>
            <div className={`text-sm ${cardTextMuted}`}>{mode === "nfl" ? "Total Value" : "Current value"}</div>
            <div className={`mt-2 text-xl ${cardTextMain}`}>
              {formatUsdc(data.analytics.currentValueAllHoldingsUsdcRaw ?? data.analytics.currentValueUsdcRaw, decimals)}
            </div>
            <p className={`mt-1 text-xs ${cardTextMutedStrong}`}>
              USDC{data.analytics.holdingsPricedCount !== undefined ? ` · priced ${data.analytics.holdingsPricedCount}/${data.holdings.length}` : ""}
            </p>
          </div>
          <div className={`rounded-xl border p-4 ${cardBorder}`}>
            <div className={`text-sm ${cardTextMuted}`}>Cost basis</div>
            <div className={`mt-2 text-xl ${cardTextMain}`}>{formatUsdc(data.analytics.totalCostBasisUsdcRaw, decimals)}</div>
            <p className={`mt-1 text-xs ${cardTextMutedStrong}`}>
              USDC
              {data.analytics.contractRenewalSpentUsdcRaw
                ? ` · renewals ${formatUsdc(data.analytics.contractRenewalSpentUsdcRaw, decimals)}`
                : ""}
            </p>
          </div>
          <div className={`rounded-xl border p-4 ${cardBorder}`}>
            <div className={`text-sm ${cardTextMuted}`}>Unrealized PnL</div>
            <div className={BigInt(portfolioUnrealizedRaw) >= 0n ? "mt-2 text-xl text-green-400" : "mt-2 text-xl text-red-400"}>
              {formatUsdc(portfolioUnrealizedRaw, decimals)}
            </div>
            <p className={`mt-1 text-xs ${cardTextMutedStrong}`}>
              USDC
              {freeTokenMode === "exclude" ? " · excluding free shares" : ""}
            </p>
          </div>
          <div className={`rounded-xl border p-4 ${cardBorder}`}>
            <div className={`text-sm ${cardTextMuted}`}>Realized PnL</div>
            <div className={BigInt(data.analytics.realizedPnlUsdcRaw) >= 0n ? "mt-2 text-xl text-green-400" : "mt-2 text-xl text-red-400"}>
              {formatUsdc(data.analytics.realizedPnlUsdcRaw, decimals)}
            </div>
            <p className={`mt-1 text-xs ${cardTextMutedStrong}`}>Cashflow · USDC</p>
            {data.analytics.realizedPnlEconomicUsdcRaw ? (
              <div className={`mt-2 text-xs ${cardTextMuted}`}>
                Economic:{" "}
                <span className={BigInt(data.analytics.realizedPnlEconomicUsdcRaw) >= 0n ? "text-green-400" : "text-red-400"}>
                  {formatUsdc(data.analytics.realizedPnlEconomicUsdcRaw, decimals)}
                </span>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {mode === "nfl" ? (
        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className={`rounded-xl border p-4 ${cardBorder}`}>
            <h2 className={`text-lg font-semibold ${cardTextMain}`}>Position Breakdown</h2>
            <p className={`mt-1 text-xs ${cardTextMutedStrong}`}>NFL-only exposure by current holding value.</p>
            <div className={`mt-3 overflow-x-auto rounded-xl border ${tableBorder}`}>
              <table className="w-full text-sm">
                <thead className={`text-left ${tableHead}`}>
                  <tr>
                    <th className="p-3">Position</th>
                    <th className="p-3">Value (USDC)</th>
                    <th className="p-3">Share</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${tableBody}`}>
                  {nflExposure.byPosition.map((row) => (
                    <tr key={row.label} className={rowText}>
                      <td className="p-3 whitespace-nowrap">{row.label}</td>
                      <td className="p-3 whitespace-nowrap">{formatUsdc(row.valueRaw.toString(), decimals)}</td>
                      <td className="p-3 whitespace-nowrap">{row.share.toFixed(2)}%</td>
                    </tr>
                  ))}
                  {nflExposure.byPosition.length === 0 ? (
                    <tr>
                      <td className={`p-3 ${cardTextMutedStrong}`} colSpan={3}>
                        No priced NFL positions yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className={`rounded-xl border p-4 ${cardBorder}`}>
            <h2 className={`text-lg font-semibold ${cardTextMain}`}>Team Exposure</h2>
            <p className={`mt-1 text-xs ${cardTextMutedStrong}`}>NFL-only exposure grouped by team.</p>
            <div className={`mt-3 overflow-x-auto rounded-xl border ${tableBorder}`}>
              <table className="w-full text-sm">
                <thead className={`text-left ${tableHead}`}>
                  <tr>
                    <th className="p-3">Team</th>
                    <th className="p-3">Value (USDC)</th>
                    <th className="p-3">Share</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${tableBody}`}>
                  {nflExposure.byTeam.map((row) => (
                    <tr key={row.label} className={rowText}>
                      <td className="p-3 whitespace-nowrap">{row.label}</td>
                      <td className="p-3 whitespace-nowrap">{formatUsdc(row.valueRaw.toString(), decimals)}</td>
                      <td className="p-3 whitespace-nowrap">{row.share.toFixed(2)}%</td>
                    </tr>
                  ))}
                  {nflExposure.byTeam.length === 0 ? (
                    <tr>
                      <td className={`p-3 ${cardTextMutedStrong}`} colSpan={3}>
                        No priced NFL team exposure yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {mode === "nfl" ? (
        <section className="mt-6">
          <div className={`rounded-xl border p-4 ${cardBorder}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className={`text-lg font-semibold ${cardTextMain}`}>Market Metadata Sources</h2>
              {nflMarketTelemetry?.asOf ? (
                <span className={`text-xs ${cardTextMutedStrong}`}>
                  as of {new Date(nflMarketTelemetry.asOf).toLocaleString()}
                </span>
              ) : null}
            </div>
            <p className={`mt-1 text-xs ${cardTextMutedStrong}`}>
              Feed: {nflMarketTelemetry?.fallbackFeed.source ?? "n/a"}
              {nflMarketTelemetry?.fallbackFeed.source === "stale_snapshot"
                ? ` · age ${formatAgeMs(nflMarketTelemetry.fallbackFeed.staleAgeMs)}`
                : ""}
              {` · resolved ${nflMarketCoverage.resolved}/${nflMarketCoverage.total} (${nflMarketCoverage.resolvedPct.toFixed(1)}%)`}
            </p>

            {nflMarketTelemetry ? (
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
                <div className={`rounded-md border p-3 ${cardBorder}`}>
                  <div className={`text-xs ${cardTextMutedStrong}`}>Onchain</div>
                  <div className={`mt-1 text-lg ${cardTextMain}`}>{nflMarketTelemetry.metadataSourceCounts.onchainOnly}</div>
                </div>
                <div className={`rounded-md border p-3 ${cardBorder}`}>
                  <div className={`text-xs ${cardTextMutedStrong}`}>Fallback</div>
                  <div className={`mt-1 text-lg ${cardTextMain}`}>{nflMarketTelemetry.metadataSourceCounts.fallbackOnly}</div>
                </div>
                <div className={`rounded-md border p-3 ${cardBorder}`}>
                  <div className={`text-xs ${cardTextMutedStrong}`}>Hybrid</div>
                  <div className={`mt-1 text-lg ${cardTextMain}`}>{nflMarketTelemetry.metadataSourceCounts.hybrid}</div>
                </div>
                <div className={`rounded-md border p-3 ${cardBorder}`}>
                  <div className={`text-xs ${cardTextMutedStrong}`}>Override</div>
                  <div className={`mt-1 text-lg ${cardTextMain}`}>{nflMarketTelemetry.metadataSourceCounts.overrideOnly}</div>
                </div>
                <div className={`rounded-md border p-3 ${cardBorder}`}>
                  <div className={`text-xs ${cardTextMutedStrong}`}>Unresolved</div>
                  <div className={`mt-1 text-lg ${cardTextMain}`}>{nflMarketTelemetry.metadataSourceCounts.unresolved}</div>
                </div>
              </div>
            ) : (
              <p className={`mt-3 text-sm ${cardTextMutedStrong}`}>Telemetry unavailable.</p>
            )}
          </div>
        </section>
      ) : null}

      {positions.length ? (
        <section className="mt-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className={`text-lg font-semibold ${cardTextMain}`}>Per-athlete breakdown (on-chain)</h2>
              <p className={`mt-1 text-sm ${cardTextMuted}`}>
                Sort/filter and export CSV. If you see <span className={cardTextMutedStrong}>(partial)</span> under tracked shares, increase scan pages.
              </p>
              <p className={`mt-1 text-xs ${cardTextMutedStrong}`}>
                Filtered now: {sortedPositions.length} tokens · value {formatUsdc(filteredCurrentValueRaw, decimals)} · unrealized PnL{" "}
                <span className={BigInt(filteredUnrealizedPnlRaw) >= 0n ? "text-green-400" : "text-red-400"}>
                  {formatUsdc(filteredUnrealizedPnlRaw, decimals)}
                </span>
                {freeTokenMode === "exclude" ? " (excluding free shares)" : ""}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {!lockedSportFilter ? (
                <label className={`text-xs ${cardTextMuted}`}>
                  Sport
                  <select
                    className={`ml-2 rounded-md border px-2 py-1 text-sm ${
                      mode === "nfl"
                        ? "border-black/10 bg-white text-zinc-700 dark:border-white/10 dark:bg-white/10 dark:text-zinc-200"
                        : "border-white/10 bg-black/30 text-gray-200"
                    }`}
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
              ) : null}

              <label className={`text-xs ${cardTextMuted}`}>
                Token
                <input
                  className={`ml-2 rounded-md border px-2 py-1 text-sm ${
                    mode === "nfl"
                      ? "border-black/10 bg-white text-zinc-700 placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/10 dark:text-zinc-200"
                      : "border-white/10 bg-black/30 text-gray-200 placeholder:text-gray-500"
                  }`}
                  value={tokenQuery}
                  onChange={(e) => setTokenQuery(e.target.value)}
                  placeholder="name or token id"
                />
              </label>

              <label className={`text-xs ${cardTextMuted}`}>
                Free tokens
                <select
                  className={`ml-2 rounded-md border px-2 py-1 text-sm ${
                    mode === "nfl"
                      ? "border-black/10 bg-white text-zinc-700 dark:border-white/10 dark:bg-white/10 dark:text-zinc-200"
                      : "border-white/10 bg-black/30 text-gray-200"
                  }`}
                  value={freeTokenMode}
                  onChange={(e) => setFreeTokenMode(e.target.value as FreeTokenMode)}
                >
                  <option value="include">Include</option>
                  <option value="exclude">Exclude free</option>
                </select>
              </label>

              <label className={`text-xs ${cardTextMuted}`}>
                Sort
                <select
                  className={`ml-2 rounded-md border px-2 py-1 text-sm ${
                    mode === "nfl"
                      ? "border-black/10 bg-white text-zinc-700 dark:border-white/10 dark:bg-white/10 dark:text-zinc-200"
                      : "border-white/10 bg-black/30 text-gray-200"
                  }`}
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                >
                  <option value="value">Value</option>
                  <option value="pnl">Unrealized PnL</option>
                  <option value="spent">Spent</option>
                  <option value="shares">Holding shares</option>
                </select>
              </label>

              <label className={`text-xs ${cardTextMuted}`}>
                Dir
                <select
                  className={`ml-2 rounded-md border px-2 py-1 text-sm ${
                    mode === "nfl"
                      ? "border-black/10 bg-white text-zinc-700 dark:border-white/10 dark:bg-white/10 dark:text-zinc-200"
                      : "border-white/10 bg-black/30 text-gray-200"
                  }`}
                  value={sortDir}
                  onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
                >
                  <option value="desc">Desc</option>
                  <option value="asc">Asc</option>
                </select>
              </label>

              <button
                className={`rounded-md border px-3 py-1 text-sm ${
                  mode === "nfl"
                    ? "border-black/10 bg-black/5 text-zinc-900 hover:bg-black/10 dark:border-white/10 dark:bg-white/10 dark:text-zinc-100 dark:hover:bg-white/15"
                    : "border-white/10 bg-white/10 text-white hover:bg-white/15"
                }`}
                onClick={exportPositionsCsv}
              >
                Export CSV
              </button>
            </div>
          </div>

          <div className={`mt-3 overflow-x-auto rounded-xl border ${tableBorder}`}>
            <table className="w-full text-sm">
              <thead className={`text-left ${tableHead}`}>
                <tr>
                  <th className="p-3">Sport</th>
                  <th className="p-3">Player</th>
                  <th className="p-3">Average TP</th>
                  <th className="p-3">Holding shares</th>
                  <th className="p-3">Spent</th>
                  <th className="p-3">Avg cost/share</th>
                  <th className="p-3">Current price/share</th>
                  <th className="p-3">{freeTokenMode === "exclude" ? "Value (ex free)" : "Value"}</th>
                  <th className="p-3">{freeTokenMode === "exclude" ? "Unrealized PnL (ex free)" : "Unrealized PnL"}</th>
                  <th className="p-3">Tracked shares</th>
                  <th className="p-3">History</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${tableBody}`}>
              {sortedPositions.slice(0, 400).map((p) => {
                const pnl = getPositionPnlRaw(p);
                const value = getPositionValueRaw(p);
                const freeSharesHeld = BigInt(p.freeSharesHeldRaw ?? p.promoSharesHeldRaw ?? "0");
                const pnlClass = pnl ? (BigInt(pnl) >= 0n ? "text-green-400" : "text-red-400") : "text-gray-500";
                const historyHref = tokenHistoryHref(p.playerToken, p.tokenIdDec);

                  return (
                    <tr key={`${p.playerToken}:${p.tokenIdDec}`} className={rowText}>
                      <td className="p-3 whitespace-nowrap" title={p.playerToken}>
                        {getSportfunSportLabel(p.playerToken).toUpperCase()}
                      </td>
                      <td className="p-3 whitespace-nowrap">{renderTokenLabel(p.playerToken, p.tokenIdDec)}</td>
                      <td className="p-3 whitespace-nowrap">
                        {formatTpAverage(p.averageTpPerTournament)}
                        {typeof p.tournamentsCount === "number" && p.tournamentsCount > 0 ? (
                          <span className={`ml-1 text-xs ${cardTextMutedStrong}`}>({p.tournamentsCount})</span>
                        ) : null}
                      </td>
                      <td className="p-3 whitespace-nowrap">{formatShares(p.holdingSharesRaw)}</td>
                      <td className="p-3 whitespace-nowrap">{p.totals ? formatUsdc(p.totals.spentUsdcRaw, decimals) : "—"}</td>
                      <td className="p-3 whitespace-nowrap">
                        {hasValue(p.avgCostUsdcPerShareRaw) ? formatUsdc(p.avgCostUsdcPerShareRaw, decimals) : "—"}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {hasValue(p.currentPriceUsdcPerShareRaw) ? formatUsdc(p.currentPriceUsdcPerShareRaw, decimals) : "—"}
                      </td>
                      <td className="p-3 whitespace-nowrap">{value ? formatUsdc(value, decimals) : "—"}</td>
                      <td className={`p-3 whitespace-nowrap ${pnlClass}`}>{pnl ? formatUsdc(pnl, decimals) : "—"}</td>
                      <td className="p-3 whitespace-nowrap text-gray-400">
                        <div>{formatShares(p.trackedSharesRaw)}{BigInt(p.trackedSharesRaw) !== BigInt(p.holdingSharesRaw) ? " (partial)" : ""}</div>
                        {freeSharesHeld > 0n ? (
                          <div className="text-xs text-amber-300">free {formatShares(freeSharesHeld.toString(10))}</div>
                        ) : null}
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
                    <td className={`p-3 ${cardTextMutedStrong}`} colSpan={11}>
                      No positions for selected filters.
                    </td>
                  </tr>
                ) : null}
                {sortedPositions.length > 400 ? (
                  <tr>
                    <td className={`p-3 ${cardTextMutedStrong}`} colSpan={11}>
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
        <h2 className={`text-lg font-semibold ${cardTextMain}`}>Holdings</h2>
        <p className={`mt-1 text-sm ${cardTextMuted}`}>{data.assumptions.shareUnits}</p>
        {data.summary.scanIncomplete ? (
          <p className="mt-2 text-sm text-amber-400">Scan incomplete. Try raising maxPages.</p>
        ) : null}

        <div className={`mt-3 overflow-x-auto rounded-xl border ${tableBorder}`}>
          <table className="w-full text-sm">
            <thead className={`text-left ${tableHead}`}>
              <tr>
                <th className="p-3">Player</th>
                <th className="p-3">Sport</th>
                <th className="p-3">Shares</th>
                <th className="p-3">Price (USDC/share)</th>
                <th className="p-3">Value (USDC)</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${tableBody}`}>
              {data.holdings.map((h) => (
                <tr key={`${h.contractAddress}:${h.tokenIdHex}`} className={rowText}>
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
                        <div className={`truncate ${cardTextMain}`}>
                          {h.metadata?.name ??
                            getSportfunNameOverride(h.contractAddress, h.tokenIdDec) ??
                            "Unknown"}
                        </div>
                        <div className={`text-xs ${cardTextMutedStrong}`}>#{h.tokenIdDec}</div>
                        {h.metadataError ? (
                          <div className="text-xs text-amber-400">metadata error</div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="p-3 whitespace-nowrap" title={h.contractAddress}>
                    {getSportfunSportLabel(h.contractAddress).toUpperCase()}
                  </td>
                  <td className="p-3 whitespace-nowrap text-gray-200">{formatShares(h.balanceRaw)}</td>
                  <td className="p-3 whitespace-nowrap text-gray-200">
                    {hasValue(h.priceUsdcPerShareRaw) ? formatUsdc(h.priceUsdcPerShareRaw, decimals) : "—"}
                  </td>
                  <td className="p-3 whitespace-nowrap text-gray-200">
                    {hasValue(h.valueUsdcRaw) ? formatUsdc(h.valueUsdcRaw, decimals) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className={`text-lg font-semibold ${cardTextMain}`}>
              {mode === "nfl" ? "Transaction History" : "Activity (tx grouped)"}
            </h2>
            <p className={`mt-1 text-xs ${cardTextMutedStrong}`}>
              Showing {filteredActivity.length}
              {activityTokenFilter !== "all" ? ` of ${data.activity.length}` : ""} rows (auto-load on scroll).
            </p>
            <p className={`mt-1 text-sm ${cardTextMuted}`}>{data.assumptions.usdc.note}</p>
          </div>
          <div className="flex items-center gap-3">
            <label className={`text-xs ${cardTextMuted}`}>
              Athlete
              <select
                className={`ml-2 rounded-md border px-2 py-1 text-sm ${
                  mode === "nfl"
                    ? "border-black/10 bg-white text-zinc-700 dark:border-white/10 dark:bg-white/10 dark:text-zinc-200"
                    : "border-white/10 bg-black/30 text-gray-200"
                }`}
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
            <label className={`text-xs ${cardTextMuted}`}>
              Type
              <select
                className={`ml-2 rounded-md border px-2 py-1 text-sm ${
                  mode === "nfl"
                    ? "border-black/10 bg-white text-zinc-700 dark:border-white/10 dark:bg-white/10 dark:text-zinc-200"
                    : "border-white/10 bg-black/30 text-gray-200"
                }`}
                value={activityKindFilter}
                onChange={(e) => setActivityKindFilter(e.target.value as ActivityKindFilter)}
              >
                <option value="all">All</option>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
                <option value="scam">Scam</option>
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

        <div className={`mt-3 overflow-x-auto rounded-xl border ${tableBorder}`}>
          <table className="w-full text-sm">
            <thead className={`text-left ${tableHead}`}>
              <tr>
                <th className="p-3">Time</th>
                <th className="p-3">Kind</th>
                <th className="p-3">USDC delta</th>
                <th className="p-3">Decoded</th>
                <th className="p-3">Tx</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${tableBody}`}>
              {filteredActivity.map((a) => {
                const funDeltaRaw = a.funDeltaRaw ?? "0";
                const hasFunDelta = BigInt(funDeltaRaw) !== 0n;
                return (
                <tr key={a.hash} className={rowText}>
                  <td className={`p-3 whitespace-nowrap ${cardTextMuted}`}>{a.timestamp ?? "—"}</td>
                  <td className="p-3 whitespace-nowrap">
                    {a.kind && a.kind !== "unknown" ? (
                      <span
                        className={
                          a.kind === "buy"
                            ? "text-green-400"
                            : a.kind === "sell"
                              ? "text-red-400"
                              : "text-orange-300"
                        }
                      >
                        {a.kind.toUpperCase()}
                      </span>
                    ) : (
                      <span className={cardTextMutedStrong}>—</span>
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
                        <div key={idx} className={rowText}>
                          <span className={t.kind === "buy" ? "text-green-400" : "text-red-400"}>{t.kind.toUpperCase()}</span>{" "}
                          {formatTokenLabel(t.playerToken, t.tokenIdDec)} · shares {formatShares(t.shareAmountRaw)} · wallet Δ{" "}
                          {formatUsdc(t.walletCurrencyDeltaRaw, decimals)} · trade {formatUsdc(t.currencyRaw, decimals)} · fee{" "}
                          {formatUsdc(t.feeRaw, decimals)}
                          {t.walletCurrencyDeltaSource === "receipt_reconciled" ? " · receipt-reconciled" : ""}
                        </div>
                      ))}
                      {a.decoded?.promotions?.slice(0, 2).map((p, idx) => (
                        <div key={`p-${idx}`} className="text-amber-300">
                          PROMO {formatTokenLabel(p.playerToken, p.tokenIdDec)} · shares {formatShares(p.shareAmountRaw)}
                        </div>
                      ))}
                      {a.decoded?.contractRenewals?.slice(0, 2).map((r, idx) => (
                        <div key={`r-${idx}`} className="text-orange-300">
                          RENEW {formatTokenLabel(r.playerToken, r.tokenIdDec)} · cost{" "}
                          {formatUsdc(r.amountPaidRaw, decimals)} · matches {r.matchCountRaw}
                        </div>
                      ))}
                      {a.decoded?.packOpens?.slice(0, 3).map((p, idx) => (
                        <div key={`pk-${idx}`} className="text-cyan-300">
                          PACK {formatTokenLabel(p.playerToken, p.tokenIdDec)} · shares{" "}
                          {formatShares(p.shareAmountRaw)}
                        </div>
                      ))}
                      {a.decoded?.deposits?.slice(0, 2).map((d, idx) => (
                        <div key={`d-${idx}`} className="text-sky-300">
                          {d.direction === "to_game_wallet" ? "DEPOSIT IN" : "DEPOSIT OUT"} ·{" "}
                          {formatUsdc(d.amountRaw, decimals)} USDC · {shortenAddress(d.counterparty)}
                        </div>
                      ))}
                      {hasFunDelta ? (
                        <div className={BigInt(funDeltaRaw) >= 0n ? "text-emerald-300" : "text-rose-300"}>
                          FUN {BigInt(funDeltaRaw) >= 0n ? "IN" : "OUT"} · {formatShares(funDeltaRaw)}
                        </div>
                      ) : null}
                      {a.decoded?.scams?.slice(0, 3).map((s, idx) => (
                        <div key={`s-${idx}`} className="text-orange-300">
                          SCAM {s.category.toUpperCase()} ·{" "}
                          {s.contractAddress ? shortenAddress(s.contractAddress) : "unknown-contract"}
                          {s.tokenIdDec ? ` · #${s.tokenIdDec}` : ""}
                          {s.amountRaw ? ` · amount ${s.amountRaw}` : ""}
                          {` · counterparty ${shortenAddress(s.counterparty)}`}
                        </div>
                      ))}
                      {a.decoded?.trades && a.decoded.trades.length > 3 ? (
                        <div className={cardTextMutedStrong}>+{a.decoded.trades.length - 3} more trades…</div>
                      ) : null}
                      {a.decoded?.contractRenewals && a.decoded.contractRenewals.length > 2 ? (
                        <div className={cardTextMutedStrong}>
                          +{a.decoded.contractRenewals.length - 2} more renewals…
                        </div>
                      ) : null}
                      {a.decoded?.packOpens && a.decoded.packOpens.length > 3 ? (
                        <div className={cardTextMutedStrong}>
                          +{a.decoded.packOpens.length - 3} more pack tokens…
                        </div>
                      ) : null}
                      {a.decoded?.deposits && a.decoded.deposits.length > 2 ? (
                        <div className={cardTextMutedStrong}>
                          +{a.decoded.deposits.length - 2} more deposits…
                        </div>
                      ) : null}
                      {a.decoded?.scams && a.decoded.scams.length > 3 ? (
                        <div className={cardTextMutedStrong}>
                          +{a.decoded.scams.length - 3} more scams…
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <div className="flex flex-col">
                      <a className="text-blue-400 hover:underline" href={`/sportfun/tx/${a.hash}`}>
                        Inspect
                      </a>
                      <a className={`text-xs hover:underline ${cardTextMutedStrong}`} href={`https://basescan.org/tx/${a.hash}`} target="_blank" rel="noreferrer">
                        Basescan
                      </a>
                    </div>
                  </td>
                </tr>
                );
              })}
              {filteredActivity.length === 0 ? (
                <tr>
                  <td className={`p-3 ${cardTextMutedStrong}`} colSpan={5}>
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
          <h2 className={`text-lg font-semibold ${cardTextMain}`}>Mismatch diagnostics</h2>
          <p className={`mt-1 text-sm ${cardTextMuted}`}>
            ERC-1155 deltas that were not fully explained by decoded trades/promotions.
          </p>

          <div className={`mt-3 overflow-x-auto rounded-xl border ${tableBorder}`}>
            <table className="w-full text-sm">
              <thead className={`text-left ${tableHead}`}>
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
              <tbody className={`divide-y ${tableBody}`}>
                {data.debug.shareDeltaMismatchSamples.map((s, idx) => (
                  <tr key={`${s.hash}-${idx}`} className={rowText}>
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex flex-col">
                        <a className="text-blue-400 hover:underline" href={`/sportfun/tx/${s.hash}`}>
                          Inspect
                        </a>
                        <a className={`text-xs hover:underline ${cardTextMutedStrong}`} href={`https://basescan.org/tx/${s.hash}`} target="_blank" rel="noreferrer">
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
                    <td className={`p-3 whitespace-nowrap ${cardTextMuted}`}>{s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data.analytics?.note ? (
        <section className={`mt-8 rounded-xl border p-4 ${cardBorder}`}>
          <div className={`text-sm ${cardTextMain}`}>PnL notes</div>
          <p className={`mt-2 text-sm ${cardTextMuted}`}>{data.analytics.note}</p>
        </section>
      ) : null}

      <div ref={sentinelRef} className="h-8" />
    </main>
  );
}
