import { withCache } from "@/lib/stats/cache";
import { env } from "@/lib/env";

const DEFAULT_NFL_FUN_PLAYERS_DATA_URL = "https://nfl-fun.vercel.app/data/players/players.json";
const CACHE_TTL_SECONDS = 6 * 60 * 60;

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

export async function getNflFallbackTokenMetaMap(): Promise<Map<string, NflFallbackTokenMeta>> {
  const url = env.NFL_FUN_PLAYERS_DATA_URL ?? DEFAULT_NFL_FUN_PLAYERS_DATA_URL;
  const rows = await withCache(`nfl-fallback:players:${url}`, CACHE_TTL_SECONDS, async () => {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          accept: "application/json",
          "user-agent": "pff/1.0",
        },
      });
      if (!response.ok) return [] as NflFallbackTokenMeta[];

      const payload = (await response.json()) as NflFunPlayersPayload;
      const players = Array.isArray(payload.players) ? payload.players : [];
      const byToken = new Map<string, NflFallbackTokenMeta>();

      for (const item of players) {
        if (!item || typeof item !== "object") continue;
        const meta = toFallbackMeta(item as NflFunPlayerRaw);
        if (!meta) continue;
        byToken.set(meta.tokenIdDec, mergeFallbackMeta(byToken.get(meta.tokenIdDec), meta));
      }

      return Array.from(byToken.values());
    } catch {
      return [] as NflFallbackTokenMeta[];
    }
  });

  return new Map(rows.map((row) => [row.tokenIdDec, row]));
}
