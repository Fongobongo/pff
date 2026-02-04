import { fetchNflPlayers, type NflPlayerRow } from "@/lib/stats/nflverse";
import { toUsdNumber, type SportfunMarketToken } from "@/lib/sportfunMarket";

type TokenMatch = {
  playerId: string;
  token: SportfunMarketToken;
};

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAttributeValue(attributes: unknown, matchKey: (key: string) => boolean): unknown {
  if (!attributes) return undefined;
  if (Array.isArray(attributes)) {
    for (const entry of attributes) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const key = String(record.trait_type ?? record.traitType ?? record.name ?? record.key ?? "").toLowerCase();
      if (!key) continue;
      if (matchKey(key)) return record.value ?? record.val ?? record.text ?? record.content;
    }
  }
  if (typeof attributes === "object") {
    for (const [key, value] of Object.entries(attributes as Record<string, unknown>)) {
      if (matchKey(key.toLowerCase())) return value;
    }
  }
  return undefined;
}

function extractPosition(attributes: unknown): string | undefined {
  const raw = extractAttributeValue(attributes, (key) => key.includes("position") || key === "pos");
  if (typeof raw === "string" && raw.trim()) return raw.trim().toUpperCase();
  return undefined;
}

function extractTeam(attributes: unknown): string | undefined {
  const raw = extractAttributeValue(attributes, (key) => key.includes("team") || key.includes("club"));
  if (typeof raw === "string" && raw.trim()) return raw.trim().toUpperCase();
  return undefined;
}

function pickBestCandidate(candidates: NflPlayerRow[]): NflPlayerRow {
  return candidates.reduce((best, next) => {
    const bestSeason = best.lastSeason ?? 0;
    const nextSeason = next.lastSeason ?? 0;
    if (nextSeason !== bestSeason) return nextSeason > bestSeason ? next : best;
    const bestExp = best.yearsOfExperience ?? 0;
    const nextExp = next.yearsOfExperience ?? 0;
    if (nextExp !== bestExp) return nextExp > bestExp ? next : best;
    return best;
  }, candidates[0]);
}

export async function buildNflTokenPlayerIndex(tokens: SportfunMarketToken[]): Promise<Map<string, SportfunMarketToken>> {
  const players = await fetchNflPlayers();
  const byName = new Map<string, NflPlayerRow[]>();
  for (const player of players.rows) {
    if (!player.displayName) continue;
    const key = normalizeName(player.displayName);
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push(player);
    byName.set(key, list);
  }

  const matches = new Map<string, TokenMatch>();
  for (const token of tokens) {
    if (!token.name) continue;
    const key = normalizeName(token.name);
    if (!key) continue;
    const candidates = byName.get(key);
    if (!candidates?.length) continue;

    const tokenPosition = extractPosition(token.attributes);
    const tokenTeam = extractTeam(token.attributes);
    let filtered = candidates;

    if (tokenPosition) {
      const byPos = candidates.filter(
        (player) => (player.position ?? "").toUpperCase() === tokenPosition
      );
      if (byPos.length) filtered = byPos;
    }

    if (tokenTeam && filtered.length > 1) {
      const byTeam = filtered.filter(
        (player) => (player.latestTeam ?? "").toUpperCase() === tokenTeam
      );
      if (byTeam.length) filtered = byTeam;
    }

    const picked = pickBestCandidate(filtered);
    const current = matches.get(picked.playerId);
    if (!current) {
      matches.set(picked.playerId, { playerId: picked.playerId, token });
      continue;
    }

    const currentPrice = current.token.currentPriceUsdcRaw
      ? toUsdNumber(current.token.currentPriceUsdcRaw)
      : 0;
    const nextPrice = token.currentPriceUsdcRaw ? toUsdNumber(token.currentPriceUsdcRaw) : 0;
    if (nextPrice > currentPrice) {
      matches.set(picked.playerId, { playerId: picked.playerId, token });
    }
  }

  const map = new Map<string, SportfunMarketToken>();
  for (const match of matches.values()) {
    map.set(match.playerId, match.token);
  }
  return map;
}
