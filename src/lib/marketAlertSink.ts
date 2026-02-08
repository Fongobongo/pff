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
  acknowledgedAt?: string;
  acknowledgedAtMs?: number;
};

export type MarketAlertMuteRule = {
  sport: MarketAlertSport;
  type: MarketAlertType;
  mutedAt: string;
  mutedAtMs: number;
  reason?: string;
};

type AlertsPayload = {
  updatedAt: number;
  alerts: MarketAlertEvent[];
  muteRules: MarketAlertMuteRule[];
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
  const acknowledgedAt = typeof record.acknowledgedAt === "string" ? record.acknowledgedAt : undefined;
  const acknowledgedAtMs =
    typeof record.acknowledgedAtMs === "number" && Number.isFinite(record.acknowledgedAtMs)
      ? record.acknowledgedAtMs
      : undefined;
  return { id, ts, tsMs, sport, type, message, data, acknowledgedAt, acknowledgedAtMs };
}

function normalizeMuteRule(value: unknown): MarketAlertMuteRule | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const sport = record.sport === "nfl" || record.sport === "soccer" ? record.sport : null;
  const type =
    record.type === "fallback_stale_feed" || record.type === "unresolved_share_high"
      ? record.type
      : null;
  const mutedAt = typeof record.mutedAt === "string" ? record.mutedAt : null;
  const mutedAtMs =
    typeof record.mutedAtMs === "number" && Number.isFinite(record.mutedAtMs) ? record.mutedAtMs : null;
  const reason = typeof record.reason === "string" ? record.reason : undefined;
  if (!sport || !type || !mutedAt || mutedAtMs === null) return null;
  return { sport, type, mutedAt, mutedAtMs, reason };
}

function ruleKey(sport: MarketAlertSport, type: MarketAlertType): string {
  return `${sport}:${type}`;
}

function pruneMuteRules(rules: MarketAlertMuteRule[]): MarketAlertMuteRule[] {
  const sorted = [...rules].sort((a, b) => b.mutedAtMs - a.mutedAtMs);
  const dedupe = new Set<string>();
  const out: MarketAlertMuteRule[] = [];
  for (const rule of sorted) {
    const key = ruleKey(rule.sport, rule.type);
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    out.push(rule);
  }
  return out.sort((a, b) => {
    if (a.sport === b.sport) return a.type.localeCompare(b.type);
    return a.sport.localeCompare(b.sport);
  });
}

function isTypeMuted(rules: MarketAlertMuteRule[], sport: MarketAlertSport, type: MarketAlertType): boolean {
  return rules.some((rule) => rule.sport === sport && rule.type === type);
}

function hasPayloadData(payload: AlertsPayload): boolean {
  return payload.alerts.length > 0 || payload.muteRules.length > 0;
}

function normalizePayload(value: unknown): AlertsPayload {
  if (!value || typeof value !== "object") {
    return { updatedAt: Date.now(), alerts: [], muteRules: [] };
  }
  const record = value as Record<string, unknown>;
  const updatedAt =
    typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt) ? record.updatedAt : Date.now();
  const rawAlerts = Array.isArray(record.alerts) ? record.alerts : [];
  const rawMuteRules = Array.isArray(record.muteRules) ? record.muteRules : [];
  const alerts = rawAlerts
    .map(normalizeAlert)
    .filter((item): item is MarketAlertEvent => item !== null)
    .sort((a, b) => b.tsMs - a.tsMs);
  const muteRules = pruneMuteRules(
    rawMuteRules.map(normalizeMuteRule).filter((item): item is MarketAlertMuteRule => item !== null)
  );
  return { updatedAt, alerts, muteRules };
}

function ensureAlertsDir() {
  fs.mkdirSync(ALERTS_DIR, { recursive: true });
}

function readFilePayload(): AlertsPayload {
  try {
    const raw = fs.readFileSync(ALERTS_FILE, "utf8");
    return normalizePayload(JSON.parse(raw));
  } catch {
    return { updatedAt: Date.now(), alerts: [], muteRules: [] };
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
    if (hasPayloadData(kvPayload)) return { payload: kvPayload, sink: "kv" };
  }

  const filePayload = readFilePayload();
  if (hasPayloadData(filePayload)) return { payload: filePayload, sink: "file" };
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
}): Promise<{ alert: MarketAlertEvent | null; sink: AlertSink; suppressedByMute: boolean }> {
  const now = Date.now();
  const current = await readAlertsPayload();
  const muteRules = pruneMuteRules(current.payload.muteRules);
  if (isTypeMuted(muteRules, input.sport, input.type)) {
    return { alert: null, sink: current.sink, suppressedByMute: true };
  }
  const nextAlert: MarketAlertEvent = {
    id: `${now}:${Math.random().toString(36).slice(2, 10)}`,
    ts: new Date(now).toISOString(),
    tsMs: now,
    sport: input.sport,
    type: input.type,
    message: input.message,
    data: input.data,
  };

  const alerts = pruneAlerts([nextAlert, ...current.payload.alerts], now);
  const payload: AlertsPayload = { updatedAt: now, alerts, muteRules };
  const sink = await writeAlertsPayload(payload);
  return { alert: nextAlert, sink, suppressedByMute: false };
}

export async function getMarketAlerts(params?: {
  limit?: number;
  sport?: MarketAlertSport;
  type?: MarketAlertType;
}) {
  const current = await readAlertsPayload();
  const now = Date.now();
  const alerts = pruneAlerts(current.payload.alerts, now);
  const muteRules = pruneMuteRules(current.payload.muteRules);
  const list = alerts.filter((alert) => {
    if (params?.sport && alert.sport !== params.sport) return false;
    if (params?.type && alert.type !== params.type) return false;
    return true;
  });
  const totalUnacknowledged = list.filter((alert) => !alert.acknowledgedAt).length;

  const limit = clampInt(params?.limit ?? 50, 1, 200);
  return {
    sink: current.sink,
    updatedAt: new Date(current.payload.updatedAt).toISOString(),
    retentionHours: clampInt(env.MARKET_ALERT_RETENTION_HOURS, 1, 24 * 365),
    maxEntries: configuredMaxAlerts(),
    total: list.length,
    totalUnacknowledged,
    muteRules,
    alerts: list.slice(0, limit),
  };
}

export async function isMarketAlertMuted(params: {
  sport: MarketAlertSport;
  type: MarketAlertType;
}): Promise<boolean> {
  const current = await readAlertsPayload();
  const muteRules = pruneMuteRules(current.payload.muteRules);
  return isTypeMuted(muteRules, params.sport, params.type);
}

export async function setMarketAlertMute(params: {
  sport: MarketAlertSport;
  type: MarketAlertType;
  muted: boolean;
  reason?: string;
}): Promise<{
  sink: AlertSink;
  muted: boolean;
  muteRule?: MarketAlertMuteRule;
  muteRules: MarketAlertMuteRule[];
}> {
  const now = Date.now();
  const current = await readAlertsPayload();
  const existingRules = pruneMuteRules(current.payload.muteRules);

  let nextRules = existingRules;
  let nextRule: MarketAlertMuteRule | undefined;

  if (params.muted) {
    nextRule = {
      sport: params.sport,
      type: params.type,
      mutedAt: new Date(now).toISOString(),
      mutedAtMs: now,
      reason: params.reason?.trim() || undefined,
    };
    nextRules = pruneMuteRules([
      nextRule,
      ...existingRules.filter((rule) => !(rule.sport === params.sport && rule.type === params.type)),
    ]);
  } else {
    nextRules = existingRules.filter((rule) => !(rule.sport === params.sport && rule.type === params.type));
  }

  const alerts = pruneAlerts(current.payload.alerts, now);
  const payload: AlertsPayload = {
    updatedAt: now,
    alerts,
    muteRules: nextRules,
  };
  const sink = await writeAlertsPayload(payload);
  return {
    sink,
    muted: params.muted,
    muteRule: nextRule,
    muteRules: nextRules,
  };
}

export async function acknowledgeMarketAlertById(alertId: string): Promise<{
  sink: AlertSink;
  found: boolean;
  alreadyAcknowledged: boolean;
  alert?: MarketAlertEvent;
}> {
  const id = alertId.trim();
  if (!id) {
    return { sink: "none", found: false, alreadyAcknowledged: false };
  }

  const now = Date.now();
  const current = await readAlertsPayload();
  const muteRules = pruneMuteRules(current.payload.muteRules);
  const alerts = pruneAlerts(current.payload.alerts, now);
  let found = false;
  let alreadyAcknowledged = false;
  let matchedAlert: MarketAlertEvent | undefined;

  const nextAlerts = alerts.map((alert) => {
    if (alert.id !== id) return alert;
    found = true;
    matchedAlert = alert;
    if (alert.acknowledgedAt) {
      alreadyAcknowledged = true;
      return alert;
    }
    const acknowledgedAlert: MarketAlertEvent = {
      ...alert,
      acknowledgedAt: new Date(now).toISOString(),
      acknowledgedAtMs: now,
    };
    matchedAlert = acknowledgedAlert;
    return acknowledgedAlert;
  });

  if (!found || alreadyAcknowledged) {
    return { sink: current.sink, found, alreadyAcknowledged, alert: matchedAlert };
  }

  const payload: AlertsPayload = {
    updatedAt: now,
    alerts: nextAlerts,
    muteRules,
  };
  const sink = await writeAlertsPayload(payload);
  return { sink, found: true, alreadyAcknowledged: false, alert: matchedAlert };
}

export async function acknowledgeMarketAlerts(params?: {
  sport?: MarketAlertSport;
  type?: MarketAlertType;
}): Promise<{ sink: AlertSink; acknowledged: number }> {
  const now = Date.now();
  const current = await readAlertsPayload();
  const muteRules = pruneMuteRules(current.payload.muteRules);
  const alerts = pruneAlerts(current.payload.alerts, now);
  let acknowledged = 0;

  const nextAlerts = alerts.map((alert) => {
    if (params?.sport && alert.sport !== params.sport) return alert;
    if (params?.type && alert.type !== params.type) return alert;
    if (alert.acknowledgedAt) return alert;
    acknowledged += 1;
    return {
      ...alert,
      acknowledgedAt: new Date(now).toISOString(),
      acknowledgedAtMs: now,
    };
  });

  if (acknowledged === 0) {
    return { sink: current.sink, acknowledged: 0 };
  }

  const payload: AlertsPayload = {
    updatedAt: now,
    alerts: nextAlerts,
    muteRules,
  };
  const sink = await writeAlertsPayload(payload);
  return { sink, acknowledged };
}
