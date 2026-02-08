import Link from "next/link";
import NflPageShell from "../_components/NflPageShell";
import { getBaseUrl } from "@/lib/serverBaseUrl";
import AlertActionButton from "./AlertActionButton";

type MarketAlert = {
  id: string;
  ts: string;
  tsMs: number;
  sport: "nfl" | "soccer";
  type: "fallback_stale_feed" | "unresolved_share_high";
  message: string;
  data?: Record<string, unknown>;
  acknowledgedAt?: string;
  acknowledgedAtMs?: number;
};

type MarketAlertMuteRule = {
  sport: "nfl" | "soccer";
  type: "fallback_stale_feed" | "unresolved_share_high";
  mutedAt: string;
  mutedAtMs: number;
  reason?: string;
};

type MarketAlertsResponse = {
  sink: string;
  updatedAt: string;
  retentionHours: number;
  maxEntries: number;
  total: number;
  totalUnacknowledged?: number;
  muteRules?: MarketAlertMuteRule[];
  alerts: MarketAlert[];
};

const TYPE_OPTIONS = [
  { key: "all", label: "All alerts" },
  { key: "fallback_stale_feed", label: "Stale feed" },
  { key: "unresolved_share_high", label: "Unresolved share high" },
] as const;

const LIMIT_OPTIONS = [25, 50, 100, 200] as const;

function buildQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

function formatType(value: MarketAlert["type"]): string {
  if (value === "fallback_stale_feed") return "fallback stale feed";
  if (value === "unresolved_share_high") return "unresolved share high";
  return value;
}

function formatData(data: Record<string, unknown> | undefined): string {
  if (!data) return "—";
  const entries = Object.entries(data);
  if (!entries.length) return "—";
  return entries
    .slice(0, 8)
    .map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(" · ");
}

export default async function NflAlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; limit?: string }>;
}) {
  const params = await searchParams;
  const selectedType =
    TYPE_OPTIONS.find((option) => option.key === params.type)?.key ?? "all";
  const selectedLimit = LIMIT_OPTIONS.includes(Number(params.limit) as (typeof LIMIT_OPTIONS)[number])
    ? Number(params.limit)
    : 50;

  const baseUrl = await getBaseUrl();
  const res = await fetch(
    `${baseUrl}/api/sportfun/market-alerts${buildQuery({
      sport: "nfl",
      limit: String(selectedLimit),
      type: selectedType === "all" ? undefined : selectedType,
    })}`,
    { cache: "no-store" }
  );
  const data = (await res.json()) as MarketAlertsResponse;
  const muteRules = Array.isArray(data.muteRules) ? data.muteRules : [];
  const muteRuleByType = new Map(
    muteRules
      .filter((rule) => rule.sport === "nfl")
      .map((rule) => [rule.type, rule] as const)
  );
  const filteredUnackCount = data.alerts.filter((alert) => !alert.acknowledgedAt).length;

  return (
    <NflPageShell
      title="NFL alerts"
      description="Recent market telemetry alerts persisted in the lightweight sink."
    >
      <section className="mt-6 flex flex-wrap gap-2">
        {TYPE_OPTIONS.map((option) => (
          <Link
            key={option.key}
            className={`rounded-full border px-3 py-1 text-xs ${
              option.key === selectedType
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/alerts${buildQuery({
              type: option.key === "all" ? undefined : option.key,
              limit: String(selectedLimit),
            })}`}
          >
            {option.label}
          </Link>
        ))}
      </section>

      <section className="mt-3 flex flex-wrap gap-2">
        {LIMIT_OPTIONS.map((limit) => (
          <Link
            key={limit}
            className={`rounded-full border px-3 py-1 text-xs ${
              limit === selectedLimit
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/alerts${buildQuery({
              type: selectedType === "all" ? undefined : selectedType,
              limit: String(limit),
            })}`}
          >
            {limit} rows
          </Link>
        ))}
      </section>

      <section className="mt-4 text-xs text-zinc-600 dark:text-zinc-400">
        Sink {data.sink} · total {data.total} · unacknowledged {data.totalUnacknowledged ?? filteredUnackCount} · retention {data.retentionHours}h · max {data.maxEntries} · updated{" "}
        {new Date(data.updatedAt).toLocaleString()}
      </section>

      <section className="mt-4 rounded-xl border border-black/10 bg-white/80 p-3 dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-wrap items-center gap-2">
          <AlertActionButton
            label={`Ack visible (${filteredUnackCount})`}
            payload={{
              action: "ack_all",
              sport: "nfl",
              type: selectedType === "all" ? undefined : selectedType,
            }}
            pendingLabel="Acking…"
            disabled={filteredUnackCount === 0}
          />
          {TYPE_OPTIONS.filter((option) => option.key !== "all").map((option) => {
            const rule = muteRuleByType.get(option.key);
            const muted = Boolean(rule);
            return (
              <span key={`mute-${option.key}`} className="inline-flex items-center gap-2">
                <AlertActionButton
                  label={muted ? `Unmute ${option.label}` : `Mute ${option.label}`}
                  payload={
                    muted
                      ? { action: "unmute", sport: "nfl", type: option.key }
                      : { action: "mute", sport: "nfl", type: option.key }
                  }
                  pendingLabel={muted ? "Unmuting…" : "Muting…"}
                  title={
                    muted
                      ? `Muted at ${rule?.mutedAt ? new Date(rule.mutedAt).toLocaleString() : "n/a"}`
                      : undefined
                  }
                />
                {muted ? (
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    muted {rule?.mutedAt ? new Date(rule.mutedAt).toLocaleString() : ""}
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Sport</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Message</th>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.alerts.map((alert) => (
                <tr key={alert.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {new Date(alert.ts).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatType(alert.type)}</td>
                  <td className="px-3 py-2 text-zinc-600 uppercase dark:text-zinc-400">{alert.sport}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {alert.acknowledgedAt ? (
                      <span>
                        Acked {new Date(alert.acknowledgedAt).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">Pending</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{alert.message}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatData(alert.data)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {alert.acknowledgedAt ? (
                      "—"
                    ) : (
                      <AlertActionButton
                        label="Acknowledge"
                        payload={{ action: "ack", alertId: alert.id }}
                        pendingLabel="Acking…"
                      />
                    )}
                  </td>
                </tr>
              ))}
              {data.alerts.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-500 dark:text-zinc-400" colSpan={7}>
                    No alerts for current filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </NflPageShell>
  );
}
