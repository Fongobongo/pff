import { withCache } from "@/lib/stats/cache";
import { env } from "@/lib/env";
import fs from "node:fs";
import path from "node:path";
import bundledSnapshot from "@/lib/nfl/nflFunFallback.snapshot.json";

const DEFAULT_NFL_FUN_PLAYERS_DATA_URL = "https://nfl-fun.vercel.app/data/players/players.json";
const CACHE_TTL_SECONDS = 6 * 60 * 60;
const STALE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const SNAPSHOT_PATH = path.join(process.cwd(), ".cache", "sportfun", "market", "nfl-fallback-players.json");

type NflFunPlayerRaw = {
  oPlayerId?: unknown;
  name?: unknown;
  position?: unknown;
  team?: unknown;
  photoUrl?: unknown;
  isTradeable?: unknown;
  circulatingSupply?: unknown;
};

type NflFunPlayersPayload = {
  players?: unknown;
};

export type NflFallbackTokenMeta = {
  tokenIdDec: string;
  name?: string;
  position?: string;
  team?: string;
  image?: string;
  isTradeable?: boolean;
  supply?: number;
};

type FallbackSnapshot = {
  updatedAt: number;
  sourceUrl: string;
  rows: NflFallbackTokenMeta[];
};

export type NflFallbackSource = "remote" | "stale_snapshot" | "bundled_snapshot" | "empty";
export type NflFallbackTokenMetaResult = {
  rows: NflFallbackTokenMeta[];
  source: NflFallbackSource;
  staleAgeMs?: number;
};

function toStringOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseTokenIdDec(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value).toString(10);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || !/^-?\d+$/.test(trimmed)) return null;
    try {
      return BigInt(trimmed).toString(10);
    } catch {
      return null;
    }
  }
  return null;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (!cleaned) return undefined;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return undefined;
    if (["1", "true", "yes"].includes(normalized)) return true;
    if (["0", "false", "no"].includes(normalized)) return false;
  }
  return undefined;
}

function normalizePosition(value?: string): string | undefined {
  if (!value) return undefined;
  const position = value.trim().toUpperCase();
  if (!position) return undefined;
  if (position.includes("QUARTERBACK") || position === "QB") return "QB";
  if (position.includes("RUNNING BACK") || position === "RB") return "RB";
  if (position.includes("WIDE RECEIVER") || position === "WR") return "WR";
  if (position.includes("TIGHT END") || position === "TE") return "TE";
  if (position.includes("KICKER") || position === "K") return "K";
  if (position.includes("DEF") || position.includes("DST")) return "DST";
  return position;
}

function normalizeTeam(value?: string): string | undefined {
  if (!value) return undefined;
  const team = value.trim().toUpperCase();
  if (!team) return undefined;
  if (team === "JAC") return "JAX";
  if (team === "LA") return "LAR";
  return team;
}

function mergeFallbackMeta(
  current: NflFallbackTokenMeta | undefined,
  next: NflFallbackTokenMeta
): NflFallbackTokenMeta {
  if (!current) return next;
  return {
    tokenIdDec: current.tokenIdDec,
    name: current.name ?? next.name,
    position: current.position ?? next.position,
    team: current.team ?? next.team,
    image: current.image ?? next.image,
    isTradeable: current.isTradeable ?? next.isTradeable,
    supply: current.supply ?? next.supply,
  };
}

function ensureSnapshotDir() {
  fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
}

function readSnapshot(): FallbackSnapshot | null {
  try {
    const raw = fs.readFileSync(SNAPSHOT_PATH, "utf8");
    const parsed = JSON.parse(raw) as FallbackSnapshot;
    if (!parsed || !Array.isArray(parsed.rows) || typeof parsed.updatedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSnapshot(rows: NflFallbackTokenMeta[], sourceUrl: string) {
  try {
    ensureSnapshotDir();
    const snapshot: FallbackSnapshot = {
      updatedAt: Date.now(),
      sourceUrl,
      rows,
    };
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot), "utf8");
  } catch {
    // ignore snapshot write errors
  }
}

function toFallbackMeta(raw: NflFunPlayerRaw): NflFallbackTokenMeta | null {
  const tokenIdDec = parseTokenIdDec(raw.oPlayerId);
  if (!tokenIdDec) return null;

  return {
    tokenIdDec,
    name: toStringOrUndefined(raw.name),
    position: normalizePosition(toStringOrUndefined(raw.position)),
    team: normalizeTeam(toStringOrUndefined(raw.team)),
    image: toStringOrUndefined(raw.photoUrl),
    isTradeable: parseBoolean(raw.isTradeable),
    supply: parseNumber(raw.circulatingSupply),
  };
}

function readBundledSnapshotRows(): NflFallbackTokenMeta[] {
  const out: NflFallbackTokenMeta[] = [];
  const rows = Array.isArray((bundledSnapshot as { rows?: unknown[] }).rows)
    ? (bundledSnapshot as { rows: unknown[] }).rows
    : [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    if (typeof record.tokenIdDec !== "string") continue;
    out.push({
      tokenIdDec: record.tokenIdDec,
      name: typeof record.name === "string" ? record.name : undefined,
      position: typeof record.position === "string" ? record.position : undefined,
      team: typeof record.team === "string" ? record.team : undefined,
      image: typeof record.image === "string" ? record.image : undefined,
      isTradeable: typeof record.isTradeable === "boolean" ? record.isTradeable : undefined,
      supply: typeof record.supply === "number" && Number.isFinite(record.supply) ? record.supply : undefined,
    });
  }
  return out;
}

export async function getNflFallbackTokenMetaMap(): Promise<Map<string, NflFallbackTokenMeta>> {
  const result = await getNflFallbackTokenMeta();
  return new Map(result.rows.map((row) => [row.tokenIdDec, row]));
}

export async function getNflFallbackTokenMeta(): Promise<NflFallbackTokenMetaResult> {
  const url = env.NFL_FUN_PLAYERS_DATA_URL ?? DEFAULT_NFL_FUN_PLAYERS_DATA_URL;
  const bundledRows = readBundledSnapshotRows();
  return withCache(`nfl-fallback:v2:players:${url}`, CACHE_TTL_SECONDS, async () => {
    const now = Date.now();
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          accept: "application/json",
          "user-agent": "pff/1.0",
        },
      });
      if (!response.ok) {
        const snapshot = readSnapshot();
        if (snapshot?.rows.length && now - snapshot.updatedAt <= STALE_MAX_AGE_MS) {
          return {
            rows: snapshot.rows,
            source: "stale_snapshot",
            staleAgeMs: now - snapshot.updatedAt,
          } satisfies NflFallbackTokenMetaResult;
        }
        if (bundledRows.length) {
          return {
            rows: bundledRows,
            source: "bundled_snapshot",
          } satisfies NflFallbackTokenMetaResult;
        }
        return { rows: [], source: "empty" } satisfies NflFallbackTokenMetaResult;
      }

      const payload = (await response.json()) as NflFunPlayersPayload;
      const players = Array.isArray(payload.players) ? payload.players : [];
      const byToken = new Map<string, NflFallbackTokenMeta>();

      for (const item of players) {
        if (!item || typeof item !== "object") continue;
        const meta = toFallbackMeta(item as NflFunPlayerRaw);
        if (!meta) continue;
        byToken.set(meta.tokenIdDec, mergeFallbackMeta(byToken.get(meta.tokenIdDec), meta));
      }

      const rows = Array.from(byToken.values());
      if (rows.length) {
        writeSnapshot(rows, url);
        return { rows, source: "remote" } satisfies NflFallbackTokenMetaResult;
      }

      const snapshot = readSnapshot();
      if (snapshot?.rows.length && now - snapshot.updatedAt <= STALE_MAX_AGE_MS) {
        return {
          rows: snapshot.rows,
          source: "stale_snapshot",
          staleAgeMs: now - snapshot.updatedAt,
        } satisfies NflFallbackTokenMetaResult;
      }
      if (bundledRows.length) {
        return {
          rows: bundledRows,
          source: "bundled_snapshot",
        } satisfies NflFallbackTokenMetaResult;
      }
      return { rows: [], source: "empty" } satisfies NflFallbackTokenMetaResult;
    } catch {
      const snapshot = readSnapshot();
      if (snapshot?.rows.length && now - snapshot.updatedAt <= STALE_MAX_AGE_MS) {
        return {
          rows: snapshot.rows,
          source: "stale_snapshot",
          staleAgeMs: now - snapshot.updatedAt,
        } satisfies NflFallbackTokenMetaResult;
      }
      if (bundledRows.length) {
        return {
          rows: bundledRows,
          source: "bundled_snapshot",
        } satisfies NflFallbackTokenMetaResult;
      }
      return { rows: [], source: "empty" } satisfies NflFallbackTokenMetaResult;
    }
  });
}
