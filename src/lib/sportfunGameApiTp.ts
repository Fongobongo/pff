import { env } from "@/lib/env";
import {
  upsertSportfunTournamentTpRows,
  type SportfunTournamentTpSport,
  type SportfunTournamentTpUpsertRow,
} from "@/lib/sportfunTournamentTp";

export const SPORTFUN_GAME_API_TP_SOURCE = "sportfun_game_api_record";

const SPORTFUN_GAME_API_REQUEST_TIMEOUT_MS = 12_000;
const SPORTFUN_GAME_API_PLAYERS_LIMIT = 500;

type SportfunGameApiSport = SportfunTournamentTpSport;
type SportfunGameApiSyncStatus = "ok" | "error" | "skipped";

type SportfunGameApiPlayerRecord = {
  id?: string;
  oPlayerId?: number | string;
  knownName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  position?: string | null;
  team?: {
    name?: string | null;
  } | null;
  record?: unknown;
};

export type SportfunGameApiSyncJobResult = {
  sport: SportfunGameApiSport;
  status: SportfunGameApiSyncStatus;
  playersFetched: number;
  rowsPrepared: number;
  rowsUpserted: number;
  error?: string;
};

export type SportfunGameApiSyncReport = {
  configured: boolean;
  includeNfl: boolean;
  includeFootball: boolean;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  rowsPreparedTotal: number;
  rowsUpsertedTotal: number;
  jobs: SportfunGameApiSyncJobResult[];
};

export type SportfunGameApiSyncOptions = {
  includeNfl?: boolean;
  includeFootball?: boolean;
  dryRun?: boolean;
};

let lastAutoSyncAtMs = 0;
let autoSyncPromise: Promise<SportfunGameApiSyncReport> | null = null;

function toCleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getSportfunGameApiToken(): string | null {
  const token = env.SPORTFUN_AUTH_BEARER_TOKEN?.trim();
  return token && token.length > 0 ? token : null;
}

function getSportfunGameApiBaseUrl(): string {
  return env.SPORTFUN_APP_API_BASE_URL.trim().replace(/\/+$/, "");
}

export function isSportfunGameApiTpConfigured(): boolean {
  return Boolean(getSportfunGameApiToken());
}

async function fetchJsonWithTimeout<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}${text ? ` - ${text.slice(0, 400)}` : ""}`);
    }
    if (!text) return [] as T;
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function extractPlayers(payload: unknown): SportfunGameApiPlayerRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter((value): value is SportfunGameApiPlayerRecord => isRecord(value));
  }
  if (!isRecord(payload)) return [];
  const data = payload.data;
  if (!Array.isArray(data)) return [];
  return data.filter((value): value is SportfunGameApiPlayerRecord => isRecord(value));
}

async function fetchSportfunPlayers(sport: SportfunGameApiSport): Promise<SportfunGameApiPlayerRecord[]> {
  const token = getSportfunGameApiToken();
  if (!token) return [];

  const baseUrl = getSportfunGameApiBaseUrl();
  const url = new URL(`${baseUrl}/${sport}/v1/players/`);
  url.searchParams.set("isTradeable", "eq:true");
  url.searchParams.set("isRetired", "eq:false");
  url.searchParams.set("limit", String(SPORTFUN_GAME_API_PLAYERS_LIMIT));

  const payload = await fetchJsonWithTimeout<unknown>(
    url.toString(),
    {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        origin: "https://app.sport.fun",
        referer: "https://app.sport.fun/",
      },
    },
    SPORTFUN_GAME_API_REQUEST_TIMEOUT_MS
  );

  return extractPlayers(payload);
}

function getPlayerId(player: SportfunGameApiPlayerRecord): string | null {
  const oPlayerId = toFiniteNumber(player.oPlayerId);
  if (oPlayerId !== null) return String(Math.trunc(oPlayerId));

  const oPlayerIdString = toCleanString(player.oPlayerId);
  if (oPlayerIdString) return oPlayerIdString;

  return toCleanString(player.id);
}

function getPlayerName(player: SportfunGameApiPlayerRecord): string | null {
  const known = toCleanString(player.knownName);
  if (known) return known;

  const firstName = toCleanString(player.firstName) ?? "";
  const lastName = toCleanString(player.lastName) ?? "";
  const combined = `${firstName} ${lastName}`.trim();
  if (combined) return combined;

  return null;
}

function getPlayerTeam(player: SportfunGameApiPlayerRecord): string | undefined {
  if (!player.team || typeof player.team !== "object") return undefined;
  const teamName = toCleanString(player.team.name);
  return teamName ?? undefined;
}

function getPlayerRecord(player: SportfunGameApiPlayerRecord): Array<{ index: number; tp: number }> {
  if (!Array.isArray(player.record)) return [];
  const out: Array<{ index: number; tp: number }> = [];
  for (let i = 0; i < player.record.length; i += 1) {
    const tp = toFiniteNumber(player.record[i]);
    out.push({ index: i + 1, tp: tp ?? 0 });
  }
  return out;
}

function buildSportfunGameApiRows(params: {
  sport: SportfunGameApiSport;
  players: SportfunGameApiPlayerRecord[];
  asOf: string;
}): SportfunTournamentTpUpsertRow[] {
  const rows: SportfunTournamentTpUpsertRow[] = [];
  const byTournamentKey = new Map<string, SportfunTournamentTpUpsertRow[]>();

  for (const player of params.players) {
    const athleteId = getPlayerId(player);
    const athleteName = getPlayerName(player);
    if (!athleteId || !athleteName) continue;

    const values = getPlayerRecord(player);
    if (!values.length) continue;

    const team = getPlayerTeam(player);
    const position = toCleanString(player.position) ?? undefined;

    for (const entry of values) {
      const tournamentKey = `${params.sport}:game_api_record:${entry.index}`;
      const row: SportfunTournamentTpUpsertRow = {
        sport: params.sport,
        tournamentKey,
        athleteId,
        athleteName,
        team,
        position,
        games: 1,
        tpTotal: entry.tp,
        tpTotalUnrounded: entry.tp,
        tpAverage: entry.tp,
        source: SPORTFUN_GAME_API_TP_SOURCE,
        asOf: params.asOf,
        providerPayload: {
          sportfunPlayerId: toCleanString(player.id),
          oPlayerId: player.oPlayerId ?? null,
          recordIndex: entry.index,
          recordLength: Array.isArray(player.record) ? player.record.length : null,
        },
      };

      rows.push(row);
      const bucket = byTournamentKey.get(tournamentKey) ?? [];
      bucket.push(row);
      byTournamentKey.set(tournamentKey, bucket);
    }
  }

  for (const bucket of byTournamentKey.values()) {
    bucket
      .slice()
      .sort((a, b) => {
        const scoreDiff = b.tpTotal - a.tpTotal;
        if (scoreDiff !== 0) return scoreDiff;
        return a.athleteName.localeCompare(b.athleteName);
      })
      .forEach((row, index) => {
        row.rank = index + 1;
      });
  }

  return rows;
}

export async function syncSportfunGameApiTp(
  options: SportfunGameApiSyncOptions = {}
): Promise<SportfunGameApiSyncReport> {
  const includeNfl = options.includeNfl ?? true;
  const includeFootball = options.includeFootball ?? true;
  const dryRun = Boolean(options.dryRun);
  const configured = isSportfunGameApiTpConfigured();
  const startedAt = new Date().toISOString();

  const jobs: SportfunGameApiSyncJobResult[] = [];
  let rowsPreparedTotal = 0;
  let rowsUpsertedTotal = 0;

  const selectedSports: SportfunGameApiSport[] = [];
  if (includeNfl) selectedSports.push("nfl");
  if (includeFootball) selectedSports.push("football");

  if (!configured) {
    for (const sport of selectedSports) {
      jobs.push({
        sport,
        status: "skipped",
        playersFetched: 0,
        rowsPrepared: 0,
        rowsUpserted: 0,
        error: "SPORTFUN_AUTH_BEARER_TOKEN is not configured",
      });
    }

    return {
      configured,
      includeNfl,
      includeFootball,
      dryRun,
      startedAt,
      finishedAt: new Date().toISOString(),
      rowsPreparedTotal,
      rowsUpsertedTotal,
      jobs,
    };
  }

  for (const sport of selectedSports) {
    try {
      const players = await fetchSportfunPlayers(sport);
      const rows = buildSportfunGameApiRows({
        sport,
        players,
        asOf: new Date().toISOString(),
      });

      rowsPreparedTotal += rows.length;
      const rowsUpserted = dryRun ? rows.length : await upsertSportfunTournamentTpRows(rows);
      rowsUpsertedTotal += rowsUpserted;

      jobs.push({
        sport,
        status: "ok",
        playersFetched: players.length,
        rowsPrepared: rows.length,
        rowsUpserted,
      });
    } catch (error: unknown) {
      jobs.push({
        sport,
        status: "error",
        playersFetched: 0,
        rowsPrepared: 0,
        rowsUpserted: 0,
        error: describeError(error),
      });
    }
  }

  return {
    configured,
    includeNfl,
    includeFootball,
    dryRun,
    startedAt,
    finishedAt: new Date().toISOString(),
    rowsPreparedTotal,
    rowsUpsertedTotal,
    jobs,
  };
}

export async function triggerSportfunGameApiTpSync(params?: {
  includeNfl?: boolean;
  includeFootball?: boolean;
  minIntervalMs?: number;
  force?: boolean;
}): Promise<SportfunGameApiSyncReport | null> {
  if (!isSportfunGameApiTpConfigured()) return null;

  const minIntervalMs =
    typeof params?.minIntervalMs === "number" && Number.isFinite(params.minIntervalMs)
      ? Math.max(0, Math.trunc(params.minIntervalMs))
      : env.SPORTFUN_GAME_TP_SYNC_INTERVAL_MINUTES * 60_000;

  if (autoSyncPromise) return autoSyncPromise;

  const now = Date.now();
  if (!params?.force && now - lastAutoSyncAtMs < minIntervalMs) {
    return null;
  }

  autoSyncPromise = syncSportfunGameApiTp({
    includeNfl: params?.includeNfl,
    includeFootball: params?.includeFootball,
  }).finally(() => {
    lastAutoSyncAtMs = Date.now();
    autoSyncPromise = null;
  });

  return autoSyncPromise;
}
