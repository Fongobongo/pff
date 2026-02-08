"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ALERT_ADMIN_TOKEN_STORAGE_KEY = "market_alert_admin_token";

type AlertActionPayload =
  | { action: "ack"; alertId: string }
  | { action: "ack_all"; sport?: "nfl" | "soccer"; type?: "fallback_stale_feed" | "unresolved_share_high" }
  | { action: "mute"; sport: "nfl" | "soccer"; type: "fallback_stale_feed" | "unresolved_share_high"; reason?: string }
  | { action: "unmute"; sport: "nfl" | "soccer"; type: "fallback_stale_feed" | "unresolved_share_high" };

type Props = {
  label: string;
  payload: AlertActionPayload;
  title?: string;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
};

export default function AlertActionButton({
  label,
  payload,
  title,
  pendingLabel = "Saving…",
  className = "",
  disabled = false,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (loading || disabled) return;
    setError(null);
    let adminToken = "";
    try {
      adminToken = window.localStorage.getItem(ALERT_ADMIN_TOKEN_STORAGE_KEY)?.trim() ?? "";
    } catch {
      adminToken = "";
    }
    if (!adminToken) {
      setError("Admin token is not set. Save it in Alerts controls first.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/sportfun/market-alerts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-market-alert-admin-token": adminToken,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let message = `Action failed: ${res.status}`;
        try {
          const json = (await res.json()) as { error?: string };
          if (json?.error) message = json.error;
        } catch {
          // ignore non-json error body
        }
        throw new Error(message);
      }
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        title={title}
        onClick={run}
        disabled={loading || disabled}
        className={`rounded-md border border-black/10 px-2 py-1 text-xs text-black hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-white dark:hover:bg-white/10 ${className}`}
      >
        {loading ? pendingLabel : label}
      </button>
      {error ? <span className="text-[10px] text-rose-500">{error}</span> : null}
    </span>
  );
}
