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

export type SportfunTournamentTpSport = "nfl" | "football";

export type SportfunTournamentTpLookupRow = {
  sport: SportfunTournamentTpSport;
  tournamentKey: string;
  athleteId: string;
  athleteName: string;
  team?: string;
  position?: string;
  tpTotal: number;
  source?: string;
  asOf?: string;
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

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    out.push(items.slice(i, i + chunkSize));
  }
  return out;
}

function toPostgrestInString(values: string[]): string {
  return values
    .map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",");
}

export function normalizeSportfunAthleteName(value: string | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

type SupabaseTournamentTpLookupRow = {
  sport?: string;
  tournament_key?: string;
  athlete_id?: string;
  athlete_name?: string;
  team?: string | null;
  position?: string | null;
  tp_total?: number | string;
  source?: string | null;
  as_of?: string | null;
};

type TournamentTpLookupSourceFilter = string | string[] | undefined;

function buildSourceFilterQuery(query: URLSearchParams, source: TournamentTpLookupSourceFilter) {
  if (!source) return;
  if (typeof source === "string") {
    const normalized = source.trim();
    if (!normalized) return;
    query.set("source", `eq.${normalized}`);
    return;
  }
  const normalized = source
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (!normalized.length) return;
  query.set("source", `in.(${toPostgrestInString([...new Set(normalized)])})`);
}

type LookupByParams = {
  sport: SportfunTournamentTpSport;
  field: "athlete_name" | "athlete_id";
  values: string[];
  source?: TournamentTpLookupSourceFilter;
  chunkSize?: number;
};

async function getSportfunTournamentTpRowsByField(params: LookupByParams): Promise<SportfunTournamentTpLookupRow[]> {
  const rawValues = params.values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (!rawValues.length) return [];
  if (!isSportfunTournamentTpStoreConfigured()) {
    warnNoSupabaseOnce();
    return [];
  }

  const values = [...new Set(rawValues)];
  const chunkSize = Math.max(1, Math.min(100, Math.trunc(params.chunkSize ?? 40)));
  const chunks = chunkArray(values, chunkSize);

  const rows: SportfunTournamentTpLookupRow[] = [];
  const dedupe = new Set<string>();

  for (const chunk of chunks) {
    const query = new URLSearchParams();
    query.set(
      "select",
      "sport,tournament_key,athlete_id,athlete_name,team,position,tp_total,source,as_of"
    );
    query.set("sport", `eq.${params.sport}`);
    query.set(params.field, `in.(${toPostgrestInString(chunk)})`);
    buildSourceFilterQuery(query, params.source);
    query.set("limit", "5000");

    try {
      const result = await supabaseRequest<SupabaseTournamentTpLookupRow[]>(
        `${SPORTFUN_TOURNAMENT_TP_TABLE}?${query.toString()}`,
        {
          method: "GET",
        }
      );
      for (const row of result) {
        const sport = row.sport === "football" ? "football" : row.sport === "nfl" ? "nfl" : null;
        if (!sport) continue;
        const tournamentKey = normalizeText(row.tournament_key ?? undefined);
        const athleteId = normalizeText(row.athlete_id ?? undefined);
        const athleteName = normalizeText(row.athlete_name ?? undefined);
        const tpTotal = toFiniteNumber(row.tp_total);
        if (!tournamentKey || !athleteId || !athleteName || tpTotal === null) continue;

        const dedupeKey = `${sport}:${tournamentKey}:${athleteId}`;
        if (dedupe.has(dedupeKey)) continue;
        dedupe.add(dedupeKey);

        rows.push({
          sport,
          tournamentKey,
          athleteId,
          athleteName,
          team: normalizeText(row.team ?? undefined) ?? undefined,
          position: normalizeText(row.position ?? undefined) ?? undefined,
          tpTotal,
          source: normalizeText(row.source ?? undefined) ?? undefined,
          asOf: normalizeText(row.as_of ?? undefined) ?? undefined,
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("supabase_not_configured")) {
        warnTpStoreOnce(
          `Unable to read ${SPORTFUN_TOURNAMENT_TP_TABLE} by athlete names (${message}).`
        );
      }
      return [];
    }
  }

  return rows;
}

export async function getSportfunTournamentTpRowsByAthleteNames(params: {
  sport: SportfunTournamentTpSport;
  athleteNames: string[];
  source?: TournamentTpLookupSourceFilter;
  chunkSize?: number;
}): Promise<SportfunTournamentTpLookupRow[]> {
  return getSportfunTournamentTpRowsByField({
    sport: params.sport,
    field: "athlete_name",
    values: params.athleteNames,
    source: params.source,
    chunkSize: params.chunkSize,
  });
}

export async function getSportfunTournamentTpRowsByAthleteIds(params: {
  sport: SportfunTournamentTpSport;
  athleteIds: string[];
  source?: TournamentTpLookupSourceFilter;
  chunkSize?: number;
}): Promise<SportfunTournamentTpLookupRow[]> {
  return getSportfunTournamentTpRowsByField({
    sport: params.sport,
    field: "athlete_id",
    values: params.athleteIds,
    source: params.source,
    chunkSize: params.chunkSize,
  });
}
