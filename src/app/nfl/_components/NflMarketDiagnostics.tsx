import { getBaseUrl } from "@/lib/serverBaseUrl";

type MarketDiagnosticsResponse = {
  asOf?: string;
  tokens?: unknown[];
  stats?: {
    metadataSourceCounts?: {
      onchainOnly?: number;
      fallbackOnly?: number;
      hybrid?: number;
      overrideOnly?: number;
      unresolved?: number;
    };
    fallbackFeed?: {
      source?: string;
      staleAgeMs?: number;
    };
  };
};

type MarketAlertsResponse = {
  sink?: string;
  total?: number;
  muteRules?: Array<{
    sport?: string;
    type?: string;
  }>;
  alerts?: Array<{
    ts?: string;
    type?: string;
  }>;
};

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

export default async function NflMarketDiagnostics() {
  try {
    const baseUrl = await getBaseUrl();
    const [res, alertsRes] = await Promise.all([
      fetch(`${baseUrl}/api/sportfun/market?sport=nfl&windowHours=24&trendDays=30&maxTokens=1000`, {
        next: { revalidate: 120 },
      }),
      fetch(`${baseUrl}/api/sportfun/market-alerts?sport=nfl&limit=1`, {
        cache: "no-store",
      }),
    ]);
    if (!res.ok) throw new Error(`market diagnostics request failed: ${res.status}`);

    const data = (await res.json()) as MarketDiagnosticsResponse;
    const alertsData = alertsRes.ok ? ((await alertsRes.json()) as MarketAlertsResponse) : null;
    const latestAlert = alertsData?.alerts?.[0];
    const mutedTypes = (alertsData?.muteRules ?? [])
      .filter((rule) => rule.sport === "nfl" && typeof rule.type === "string")
      .map((rule) => String(rule.type))
      .sort();
    const counts = data.stats?.metadataSourceCounts ?? {};
    const fallbackFeed = data.stats?.fallbackFeed ?? {};
    const totalTokens = Array.isArray(data.tokens) ? data.tokens.length : 0;
    const unresolved = Number(counts.unresolved ?? 0);
    const resolved =
      Number(counts.onchainOnly ?? 0) +
      Number(counts.fallbackOnly ?? 0) +
      Number(counts.hybrid ?? 0) +
      Number(counts.overrideOnly ?? 0);
    const unresolvedSharePct = Number(
      res.headers.get("x-market-unresolved-share-pct") ?? (totalTokens > 0 ? ((unresolved / totalTokens) * 100).toFixed(2) : "0")
    );
    const thresholdPct = Number(res.headers.get("x-market-unresolved-alert-threshold-pct") ?? "25");
    const isWarning = Number.isFinite(unresolvedSharePct) && unresolvedSharePct >= thresholdPct;

    return (
      <section className="mt-4 rounded-xl border border-black/10 bg-white/80 p-3 text-xs text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium text-zinc-800 dark:text-zinc-200">Market diagnostics</span>
          <span>feed {fallbackFeed.source ?? "n/a"}</span>
          {fallbackFeed.source === "stale_snapshot" ? (
            <span>feed age {formatAgeMs(fallbackFeed.staleAgeMs)}</span>
          ) : null}
          <span>resolved {resolved}/{totalTokens}</span>
          <span className={isWarning ? "text-rose-500" : ""}>
            unresolved {unresolved}/{totalTokens} ({Number.isFinite(unresolvedSharePct) ? unresolvedSharePct.toFixed(2) : "n/a"}%)
          </span>
          <span>alert ≥ {Number.isFinite(thresholdPct) ? thresholdPct.toFixed(0) : "25"}%</span>
          <span>alerts {alertsData?.total ?? 0}</span>
          <span>sink {alertsData?.sink ?? "n/a"}</span>
          <span>muted {mutedTypes.length ? mutedTypes.join(",") : "none"}</span>
          {latestAlert?.ts ? (
            <span>
              last alert {new Date(latestAlert.ts).toLocaleString()} ({latestAlert.type ?? "unknown"})
            </span>
          ) : null}
          <span>as of {data.asOf ? new Date(data.asOf).toLocaleString() : "n/a"}</span>
        </div>
      </section>
    );
  } catch {
    return (
      <section className="mt-4 rounded-xl border border-black/10 bg-white/80 p-3 text-xs text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
        Market diagnostics unavailable.
      </section>
    );
  }
}
