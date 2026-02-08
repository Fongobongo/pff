import "server-only";

import fs from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
import { kvEnabled, kvGetJson, kvSetJson } from "@/lib/kv";

export type MarketAlertSport = "nfl" | "soccer";
export type MarketAlertType = "fallback_stale_feed" | "unresolved_share_high";

export type MarketAlertEvent = {
  id: string;
  ts: string;
  tsMs: number;
  sport: MarketAlertSport;
  type: MarketAlertType;
  message: string;
  data?: Record<string, unknown>;
};

type AlertsPayload = {
  updatedAt: number;
  alerts: MarketAlertEvent[];
};

type AlertSink = "kv" | "file" | "none";

const ALERTS_KEY = "sportfun:market-alerts:v1";
const ALERTS_DIR = path.join(process.cwd(), ".cache", "sportfun", "alerts");
const ALERTS_FILE = path.join(ALERTS_DIR, "market-alerts.json");

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function configuredMaxAlerts(): number {
  return clampInt(env.MARKET_ALERT_SINK_MAX, 50, 2000);
}

function configuredRetentionMs(): number {
  return clampInt(env.MARKET_ALERT_RETENTION_HOURS, 1, 24 * 365) * 60 * 60 * 1000;
}

function normalizeAlert(value: unknown): MarketAlertEvent | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : null;
  const ts = typeof record.ts === "string" ? record.ts : null;
  const tsMs = typeof record.tsMs === "number" && Number.isFinite(record.tsMs) ? record.tsMs : null;
  const sport = record.sport === "nfl" || record.sport === "soccer" ? record.sport : null;
  const type =
    record.type === "fallback_stale_feed" || record.type === "unresolved_share_high"
      ? record.type
      : null;
  const message = typeof record.message === "string" ? record.message : null;
  if (!id || !ts || tsMs === null || !sport || !type || !message) return null;
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : undefined;
  return { id, ts, tsMs, sport, type, message, data };
}

function normalizePayload(value: unknown): AlertsPayload {
  if (!value || typeof value !== "object") {
    return { updatedAt: Date.now(), alerts: [] };
  }
  const record = value as Record<string, unknown>;
  const updatedAt =
    typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt) ? record.updatedAt : Date.now();
  const rawAlerts = Array.isArray(record.alerts) ? record.alerts : [];
  const alerts = rawAlerts
    .map(normalizeAlert)
    .filter((item): item is MarketAlertEvent => item !== null)
    .sort((a, b) => b.tsMs - a.tsMs);
  return { updatedAt, alerts };
}

function ensureAlertsDir() {
  fs.mkdirSync(ALERTS_DIR, { recursive: true });
}

function readFilePayload(): AlertsPayload {
  try {
    const raw = fs.readFileSync(ALERTS_FILE, "utf8");
    return normalizePayload(JSON.parse(raw));
  } catch {
    return { updatedAt: Date.now(), alerts: [] };
  }
}

function writeFilePayload(payload: AlertsPayload): boolean {
  try {
    ensureAlertsDir();
    fs.writeFileSync(ALERTS_FILE, JSON.stringify(payload), "utf8");
    return true;
  } catch {
    return false;
  }
}

async function readAlertsPayload(): Promise<{ payload: AlertsPayload; sink: AlertSink }> {
  if (kvEnabled()) {
    const kvPayload = normalizePayload(await kvGetJson<AlertsPayload>(ALERTS_KEY));
    if (kvPayload.alerts.length > 0) return { payload: kvPayload, sink: "kv" };
  }

  const filePayload = readFilePayload();
  if (filePayload.alerts.length > 0) return { payload: filePayload, sink: "file" };
  return { payload: filePayload, sink: kvEnabled() ? "kv" : "none" };
}

function pruneAlerts(alerts: MarketAlertEvent[], now: number): MarketAlertEvent[] {
  const retentionMs = configuredRetentionMs();
  const maxAlerts = configuredMaxAlerts();
  const minTs = now - retentionMs;
  const dedupe = new Set<string>();
  const pruned: MarketAlertEvent[] = [];
  for (const alert of alerts.sort((a, b) => b.tsMs - a.tsMs)) {
    if (alert.tsMs < minTs) continue;
    if (dedupe.has(alert.id)) continue;
    dedupe.add(alert.id);
    pruned.push(alert);
    if (pruned.length >= maxAlerts) break;
  }
  return pruned;
}

async function writeAlertsPayload(payload: AlertsPayload): Promise<AlertSink> {
  if (kvEnabled()) {
    const ttlSeconds = Math.max(3600, Math.ceil((configuredRetentionMs() * 2) / 1000));
    const ok = await kvSetJson(ALERTS_KEY, payload, ttlSeconds);
    if (ok) return "kv";
  }
  return writeFilePayload(payload) ? "file" : "none";
}

export async function appendMarketAlert(input: {
  sport: MarketAlertSport;
  type: MarketAlertType;
  message: string;
  data?: Record<string, unknown>;
}): Promise<{ alert: MarketAlertEvent; sink: AlertSink }> {
  const now = Date.now();
  const nextAlert: MarketAlertEvent = {
    id: `${now}:${Math.random().toString(36).slice(2, 10)}`,
    ts: new Date(now).toISOString(),
    tsMs: now,
    sport: input.sport,
    type: input.type,
    message: input.message,
    data: input.data,
  };

  const current = await readAlertsPayload();
  const alerts = pruneAlerts([nextAlert, ...current.payload.alerts], now);
  const payload: AlertsPayload = { updatedAt: now, alerts };
  const sink = await writeAlertsPayload(payload);
  return { alert: nextAlert, sink };
}

export async function getMarketAlerts(params?: {
  limit?: number;
  sport?: MarketAlertSport;
  type?: MarketAlertType;
}) {
  const current = await readAlertsPayload();
  const list = pruneAlerts(current.payload.alerts, Date.now()).filter((alert) => {
    if (params?.sport && alert.sport !== params.sport) return false;
    if (params?.type && alert.type !== params.type) return false;
    return true;
  });

  const limit = clampInt(params?.limit ?? 50, 1, 200);
  return {
    sink: current.sink,
    updatedAt: new Date(current.payload.updatedAt).toISOString(),
    retentionHours: clampInt(env.MARKET_ALERT_RETENTION_HOURS, 1, 24 * 365),
    maxEntries: configuredMaxAlerts(),
    total: list.length,
    alerts: list.slice(0, limit),
  };
}
