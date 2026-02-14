import { env } from "@/lib/env";

export type SportfunTournamentTpUpsertRow = {
  sport: string;
  tournamentKey: string;
  competitionId?: number;
  seasonId?: number;
  seasonType?: string;
  weekStart?: number;
  weekEnd?: number;
  athleteId: string;
  athleteName: string;
  team?: string;
  position?: string;
  games: number;
  tpTotal: number;
  tpTotalUnrounded?: number;
  tpAverage: number;
  rank?: number;
  source: string;
  asOf?: string;
  providerPayload?: unknown;
};

const SPORTFUN_TOURNAMENT_TP_TABLE = "sportfun_athlete_tournament_tp";
const SUPABASE_REQUEST_TIMEOUT_MS = 12_000;

let warnedNoSupabase = false;
let warnedTpStore = false;

function getSupabaseConfig(): { baseUrl: string; apiKey: string } | null {
  const baseUrl = env.SUPABASE_PROJECT_URL?.trim().replace(/\/+$/, "");
  const apiKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}

function warnNoSupabaseOnce() {
  if (warnedNoSupabase) return;
  warnedNoSupabase = true;
  console.warn(
    "[sportfun-tp] Supabase is not configured. Set SUPABASE_PROJECT_URL + SUPABASE_SERVICE_ROLE_KEY."
  );
}

function warnTpStoreOnce(message: string) {
  if (warnedTpStore) return;
  warnedTpStore = true;
  console.warn(`[sportfun-tp] ${message}`);
}

function normalizeText(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeNumber(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

async function fetchJsonWithTimeout<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
    const raw = await res.text();
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}${raw ? ` - ${raw.slice(0, 400)}` : ""}`);
    }
    if (!raw) return [] as T;
    return JSON.parse(raw) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function supabaseRequest<T>(pathWithQuery: string, init: RequestInit): Promise<T> {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    warnNoSupabaseOnce();
    throw new Error("supabase_not_configured");
  }
  return fetchJsonWithTimeout<T>(
    `${cfg.baseUrl}/rest/v1/${pathWithQuery}`,
    {
      ...init,
      headers: {
        apikey: cfg.apiKey,
        Authorization: `Bearer ${cfg.apiKey}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    },
    SUPABASE_REQUEST_TIMEOUT_MS
  );
}

export function isSportfunTournamentTpStoreConfigured(): boolean {
  return Boolean(getSupabaseConfig());
}

export async function upsertSportfunTournamentTpRows(rows: SportfunTournamentTpUpsertRow[]): Promise<number> {
  if (!rows.length) return 0;
  if (!isSportfunTournamentTpStoreConfigured()) {
    warnNoSupabaseOnce();
    return 0;
  }

  const deduped = new Map<string, SportfunTournamentTpUpsertRow>();
  for (const row of rows) {
    const key = `${row.sport}:${row.tournamentKey}:${row.athleteId}`;
    const previous = deduped.get(key);
    if (!previous) {
      deduped.set(key, row);
      continue;
    }
    const previousAsOf = Date.parse(previous.asOf ?? "");
    const nextAsOf = Date.parse(row.asOf ?? "");
    if (Number.isFinite(nextAsOf) && (!Number.isFinite(previousAsOf) || nextAsOf >= previousAsOf)) {
      deduped.set(key, row);
    }
  }

  const payload = [...deduped.values()].map((row) => ({
    sport: row.sport,
    tournament_key: row.tournamentKey,
    competition_id: normalizeNumber(row.competitionId),
    season_id: normalizeNumber(row.seasonId),
    season_type: normalizeText(row.seasonType),
    week_start: normalizeNumber(row.weekStart),
    week_end: normalizeNumber(row.weekEnd),
    athlete_id: row.athleteId,
    athlete_name: row.athleteName,
    team: normalizeText(row.team),
    position: normalizeText(row.position),
    games: Math.max(0, Math.trunc(row.games)),
    tp_total: row.tpTotal,
    tp_total_unrounded: normalizeNumber(row.tpTotalUnrounded),
    tp_average: row.tpAverage,
    rank: normalizeNumber(row.rank),
    source: row.source,
    as_of: row.asOf ?? new Date().toISOString(),
    provider_payload: row.providerPayload ?? null,
  }));

  try {
    await supabaseRequest<unknown>(
      `${SPORTFUN_TOURNAMENT_TP_TABLE}?on_conflict=sport,tournament_key,athlete_id`,
      {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(payload),
      }
    );
    return payload.length;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("supabase_not_configured")) {
      warnTpStoreOnce(
        `Unable to upsert into ${SPORTFUN_TOURNAMENT_TP_TABLE}. Ensure table exists in Supabase (${message}).`
      );
    }
    return 0;
  }
}
