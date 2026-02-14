import fs from "node:fs";
import path from "node:path";
import {
  getSportfunMarketSnapshot,
  type SportfunMarketSport,
} from "@/lib/sportfunMarket";
import { SPORTFUN_PLAYER_TOKENS } from "@/lib/sportfun";
import { getSportfunSportLabel } from "@/lib/sportfunNames";
import { getNflFallbackTokenMeta } from "@/lib/nfl/nflFunFallback";

type NameMap = Record<string, string>;

const OUTPUT_PATH = path.join(
  process.cwd(),
  "src",
  "lib",
  "sportfunNameOverrides.json"
);
const TOKEN_CACHE_DIR = path.join(process.cwd(), ".cache", "sportfun", "market");
const FOOTBALL_DATA_PERSON_URL = "https://api.football-data.org/v4/persons";
const FOOTBALL_DATA_MAX_ATTEMPTS = 8;
// For the full Sport.fun auth-gated soccer source flow, see:
// docs/SPORTFUN_SOCCER_NAMES_RUNBOOK.md

function loadExistingNameMap(): NameMap {
  try {
    const raw = fs.readFileSync(OUTPUT_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: NameMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== "string") continue;
      const k = key.trim();
      const v = value.trim();
      if (!k || !v) continue;
      out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function isValidPlayerName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^#?\d+$/.test(trimmed)) return false;
  if (trimmed.toLowerCase() === "unknown") return false;
  return true;
}

function normalizeTokenIdDec(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^-?\d+$/.test(trimmed)) return trimmed;
  try {
    return BigInt(trimmed).toString(10);
  } catch {
    return "";
  }
}

function dedupeTokenIds(tokenIds: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tokenIds) {
    const normalized = normalizeTokenIdDec(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function tokenCachePath(sport: SportfunMarketSport): string {
  return path.join(TOKEN_CACHE_DIR, `tokens-${sport}.json`);
}

function loadTokenIdsFromCache(sport: SportfunMarketSport): string[] {
  try {
    const raw = fs.readFileSync(tokenCachePath(sport), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const tokenIds = Array.isArray((parsed as { tokenIds?: unknown })?.tokenIds)
      ? ((parsed as { tokenIds: unknown[] }).tokenIds as unknown[])
      : [];
    return dedupeTokenIds(
      tokenIds.filter((item): item is string => typeof item === "string")
    );
  } catch {
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryDelayMs(response: Response, bodyText: string, attempt: number): number {
  const retryAfterRaw = response.headers.get("retry-after");
  const retryAfterSec = retryAfterRaw ? Number(retryAfterRaw) : NaN;
  if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
    return Math.ceil(retryAfterSec * 1000);
  }
  const waitMatch = /wait\s+(\d+)\s+seconds/i.exec(bodyText);
  if (waitMatch) {
    return Number(waitMatch[1]) * 1000;
  }
  const backoff = Math.min(45000, 2000 * 2 ** Math.max(0, attempt - 1));
  return backoff;
}

function sortedNameMap(input: NameMap): NameMap {
  return Object.fromEntries(
    Object.entries(input).sort(([left], [right]) => left.localeCompare(right))
  );
}

function getContractsBySport(): Map<SportfunMarketSport, string[]> {
  const map = new Map<SportfunMarketSport, string[]>();
  for (const item of SPORTFUN_PLAYER_TOKENS) {
    const sport = getSportfunSportLabel(item.playerToken);
    if (sport === "unknown") continue;
    const list = map.get(sport) ?? [];
    list.push(item.playerToken.toLowerCase());
    map.set(sport, list);
  }
  return map;
}

async function collectFromMarket(
  sport: SportfunMarketSport,
  contractsBySport: Map<SportfunMarketSport, string[]>,
  existing: NameMap,
  out: NameMap
): Promise<{ added: number; totalNamed: number; tokenIds: string[] }> {
  const contracts = contractsBySport.get(sport) ?? [];
  if (!contracts.length) return { added: 0, totalNamed: 0, tokenIds: [] };

  const snapshot = await getSportfunMarketSnapshot({
    sport,
    windowHours: 24,
    trendDays: 30,
    maxTokens: 5000,
    metadataLimit: 5000,
  });

  let added = 0;
  let totalNamed = 0;
  const tokenIds = dedupeTokenIds(snapshot.tokens.map((token) => token.tokenIdDec));
  for (const token of snapshot.tokens) {
    if (!isValidPlayerName(token.name)) continue;
    totalNamed += 1;
    for (const contract of contracts) {
      const key = `${contract}:${token.tokenIdDec}`;
      if (existing[key]) continue;
      if (!out[key]) {
        out[key] = token.name.trim();
        added += 1;
      }
    }
  }

  return { added, totalNamed, tokenIds };
}

async function collectFromNflFallback(
  contractsBySport: Map<SportfunMarketSport, string[]>,
  existing: NameMap,
  out: NameMap
): Promise<{ added: number; totalNamed: number; source: string }> {
  const contracts = contractsBySport.get("nfl") ?? [];
  if (!contracts.length) return { added: 0, totalNamed: 0, source: "n/a" };

  const fallback = await getNflFallbackTokenMeta();
  let added = 0;
  let totalNamed = 0;
  for (const row of fallback.rows) {
    if (!isValidPlayerName(row.name)) continue;
    totalNamed += 1;
    for (const contract of contracts) {
      const key = `${contract}:${row.tokenIdDec}`;
      if (existing[key]) continue;
      if (!out[key]) {
        out[key] = row.name.trim();
        added += 1;
      }
    }
  }
  return { added, totalNamed, source: fallback.source };
}

async function fetchFootballDataPersonName(
  apiKey: string,
  tokenIdDec: string
): Promise<string | null> {
  const url = `${FOOTBALL_DATA_PERSON_URL}/${encodeURIComponent(tokenIdDec)}`;

  for (let attempt = 1; attempt <= FOOTBALL_DATA_MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          "X-Auth-Token": apiKey,
          Accept: "application/json",
        },
      });
    } catch (err) {
      if (attempt >= FOOTBALL_DATA_MAX_ATTEMPTS) throw err;
      await sleep(Math.min(30000, 1000 * attempt));
      continue;
    }

    if (response.status === 404) return null;

    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch {
      bodyText = "";
    }

    if (response.ok) {
      try {
        const parsed = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {};
        if (isValidPlayerName(parsed.name)) return parsed.name.trim();
        const firstName = typeof parsed.firstName === "string" ? parsed.firstName.trim() : "";
        const lastName = typeof parsed.lastName === "string" ? parsed.lastName.trim() : "";
        const merged = `${firstName} ${lastName}`.trim();
        if (isValidPlayerName(merged)) return merged;
        return null;
      } catch {
        return null;
      }
    }

    const shouldRetry = response.status === 429 || response.status >= 500;
    if (!shouldRetry || attempt >= FOOTBALL_DATA_MAX_ATTEMPTS) return null;

    const waitMs = parseRetryDelayMs(response, bodyText, attempt);
    await sleep(waitMs + 250);
  }

  return null;
}

async function collectFromSoccerFootballData(
  tokenIds: string[],
  contractsBySport: Map<SportfunMarketSport, string[]>,
  existing: NameMap,
  out: NameMap
): Promise<{
  source: string;
  total: number;
  resolved: number;
  added: number;
  unresolved: number;
  skipped: boolean;
}> {
  const source = "football-data.org/v4/persons/{id}";
  const contracts = contractsBySport.get("soccer") ?? [];
  const uniqueIds = dedupeTokenIds(tokenIds);
  if (!contracts.length || !uniqueIds.length) {
    return {
      source,
      total: uniqueIds.length,
      resolved: 0,
      added: 0,
      unresolved: uniqueIds.length,
      skipped: true,
    };
  }

  const apiKey = (process.env.FOOTBALL_DATA_API_KEY ?? "").trim();
  if (!apiKey) {
    return {
      source,
      total: uniqueIds.length,
      resolved: 0,
      added: 0,
      unresolved: uniqueIds.length,
      skipped: true,
    };
  }

  let resolved = 0;
  let added = 0;

  for (const tokenIdDec of uniqueIds) {
    const needsLookup = contracts.some((contract) => {
      const key = `${contract}:${tokenIdDec}`;
      return !existing[key] && !out[key];
    });
    if (!needsLookup) {
      resolved += 1;
      continue;
    }

    const name = await fetchFootballDataPersonName(apiKey, tokenIdDec);
    if (!isValidPlayerName(name)) continue;
    resolved += 1;
    for (const contract of contracts) {
      const key = `${contract}:${tokenIdDec}`;
      if (existing[key]) continue;
      if (!out[key]) {
        out[key] = name.trim();
        added += 1;
      }
    }
    await sleep(200);
  }

  return {
    source,
    total: uniqueIds.length,
    resolved,
    added,
    unresolved: Math.max(0, uniqueIds.length - resolved),
    skipped: false,
  };
}

async function main() {
  const existing = loadExistingNameMap();
  const output: NameMap = { ...existing };
  const contractsBySport = getContractsBySport();

  const stats: string[] = [];
  let soccerTokenIds = loadTokenIdsFromCache("soccer");

  for (const sport of ["nfl", "soccer"] as const) {
    try {
      const result = await collectFromMarket(sport, contractsBySport, existing, output);
      if (sport === "soccer" && result.tokenIds.length) {
        soccerTokenIds = result.tokenIds;
      }
      stats.push(
        `[market:${sport}] named=${result.totalNamed} added=${result.added} tokenIds=${result.tokenIds.length}`
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      stats.push(`[market:${sport}] failed=${message}`);
    }
  }

  try {
    const nflFallback = await collectFromNflFallback(
      contractsBySport,
      existing,
      output
    );
    stats.push(
      `[nfl-fallback:${nflFallback.source}] named=${nflFallback.totalNamed} added=${nflFallback.added}`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    stats.push(`[nfl-fallback] failed=${message}`);
  }

  try {
    const soccer = await collectFromSoccerFootballData(
      soccerTokenIds,
      contractsBySport,
      existing,
      output
    );
    if (soccer.skipped) {
      stats.push(`[soccer-source:${soccer.source}] skipped total=${soccer.total}`);
    } else {
      stats.push(
        `[soccer-source:${soccer.source}] total=${soccer.total} resolved=${soccer.resolved} unresolved=${soccer.unresolved} added=${soccer.added}`
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    stats.push(`[soccer-source] failed=${message}`);
  }

  const sorted = sortedNameMap(output);
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        outputPath: OUTPUT_PATH,
        existingCount: Object.keys(existing).length,
        finalCount: Object.keys(sorted).length,
        addedTotal: Object.keys(sorted).length - Object.keys(existing).length,
        stats,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`generate_sportfun_name_overrides failed: ${message}`);
  process.exit(1);
});
