import type { StatsBombMatch } from "@/lib/stats/statsbomb";

export type MatchConfidence = "strong" | "fallback";

const STOP_TOKENS = new Set([
  "fc",
  "cf",
  "ac",
  "sc",
  "afc",
  "club",
  "cd",
  "ud",
  "sd",
  "fk",
  "ec",
  "sv",
  "the",
]);

const TOKEN_ALIASES: Record<string, string> = {
  utd: "united",
  st: "saint",
  sp: "sporting",
};

const NAME_ALIASES: Record<string, string> = {
  manunited: "manchesterunited",
  manutd: "manchesterunited",
  manchesterutd: "manchesterunited",
  mancity: "manchestercity",
  mcfc: "manchestercity",
  spurs: "tottenhamhotspur",
  tottenham: "tottenhamhotspur",
  psg: "parissaintgermain",
  paris: "parissaintgermain",
  intermilan: "internazionale",
  inter: "internazionale",
  acmilan: "milan",
  barca: "barcelona",
  fcbarcelona: "barcelona",
  athleticbilbao: "athleticclub",
  athletic: "athleticclub",
  atletico: "atleticomadrid",
  atletimadrid: "atleticomadrid",
  bvb: "borussiadortmund",
  dortmund: "borussiadortmund",
  bayern: "bayernmunich",
  leipzig: "rbleipzig",
  psv: "psveindhoven",
  sporting: "sportingcp",
  porto: "fcporto",
  wolves: "wolverhamptonwanderers",
};

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeTokens(tokens: string[]): string[] {
  const normalized = tokens
    .map((token) => TOKEN_ALIASES[token] ?? token)
    .filter((token) => token.length > 0 && !STOP_TOKENS.has(token));

  return normalized;
}

function normalizeTeamName(name?: string): { key: string; tokens: string[] } {
  if (!name) return { key: "", tokens: [] };
  const cleaned = stripDiacritics(name.toLowerCase())
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const rawTokens = cleaned.split(" ").filter(Boolean);
  const tokens = normalizeTokens(rawTokens);
  const key = (tokens.join("") || cleaned.replace(/\s+/g, "")) as string;
  const aliased = NAME_ALIASES[key] ?? key;
  return { key: aliased, tokens };
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

function getTeamMatchDetails(a?: string, b?: string) {
  const aNorm = normalizeTeamName(a);
  const bNorm = normalizeTeamName(b);
  if (!aNorm.key || !bNorm.key) {
    return {
      score: 0,
      exact: false,
      contains: false,
      tokenScore: 0,
    };
  }

  const exact = aNorm.key === bNorm.key;
  const contains = !exact && (aNorm.key.includes(bNorm.key) || bNorm.key.includes(aNorm.key));

  const tokenScore = jaccardSimilarity(aNorm.tokens, bNorm.tokens);
  const score = exact ? 1 : contains ? 0.9 : Math.min(0.85, tokenScore);
  return {
    score,
    exact,
    contains,
    tokenScore,
  };
}

export function getTeamMatchScore(a?: string, b?: string): number {
  return getTeamMatchDetails(a, b).score;
}

function getDateOffsetDays(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const aDate = new Date(`${a}T00:00:00Z`);
  const bDate = new Date(`${b}T00:00:00Z`);
  if (Number.isNaN(aDate.getTime()) || Number.isNaN(bDate.getTime())) return null;
  const diffMs = Math.abs(aDate.getTime() - bDate.getTime());
  return diffMs / (1000 * 60 * 60 * 24);
}

export function findBestStatsBombMatch(
  homeName?: string,
  awayName?: string,
  candidates: StatsBombMatch[] = [],
  fixtureDate?: string
): { match?: StatsBombMatch; swapped: boolean; score: number; confidence?: MatchConfidence; reason?: string } {
  type Candidate = {
    match: StatsBombMatch;
    swapped: boolean;
    score: number;
    exactCount: number;
    containsCount: number;
    minComponent: number;
    dateOffset: number | null;
  };

  const evaluated: Candidate[] = [];

  for (const candidate of candidates) {
    const directHome = getTeamMatchDetails(candidate.home_team?.home_team_name, homeName);
    const directAway = getTeamMatchDetails(candidate.away_team?.away_team_name, awayName);
    const directScore = directHome.score + directAway.score;
    evaluated.push({
      match: candidate,
      swapped: false,
      score: directScore,
      exactCount: Number(directHome.exact) + Number(directAway.exact),
      containsCount: Number(directHome.contains) + Number(directAway.contains),
      minComponent: Math.min(directHome.score, directAway.score),
      dateOffset: getDateOffsetDays(fixtureDate, candidate.match_date),
    });

    const swapHome = getTeamMatchDetails(candidate.home_team?.home_team_name, awayName);
    const swapAway = getTeamMatchDetails(candidate.away_team?.away_team_name, homeName);
    const swapScore = swapHome.score + swapAway.score;
    evaluated.push({
      match: candidate,
      swapped: true,
      score: swapScore,
      exactCount: Number(swapHome.exact) + Number(swapAway.exact),
      containsCount: Number(swapHome.contains) + Number(swapAway.contains),
      minComponent: Math.min(swapHome.score, swapAway.score),
      dateOffset: getDateOffsetDays(fixtureDate, candidate.match_date),
    });
  }

  if (evaluated.length === 0) {
    return { match: undefined, swapped: false, score: 0, reason: "no_candidates" };
  }

  evaluated.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > 0.01) return scoreDiff;

    const exactDiff = b.exactCount - a.exactCount;
    if (exactDiff !== 0) return exactDiff;

    const containsDiff = b.containsCount - a.containsCount;
    if (containsDiff !== 0) return containsDiff;

    const minDiff = b.minComponent - a.minComponent;
    if (Math.abs(minDiff) > 0.01) return minDiff;

    if (a.swapped !== b.swapped) return a.swapped ? 1 : -1;

    const aOffset = a.dateOffset ?? 999;
    const bOffset = b.dateOffset ?? 999;
    if (aOffset !== bOffset) return aOffset - bOffset;

    return (a.match.match_id ?? 0) - (b.match.match_id ?? 0);
  });

  const best = evaluated[0];
  const strongScore = 1.15;
  const fallbackScore = 0.95;

  if (best.score < fallbackScore) {
    return { match: undefined, swapped: false, score: best.score, reason: "low_score" };
  }

  const confidence: MatchConfidence = best.score >= strongScore ? "strong" : "fallback";

  return {
    match: best.match,
    swapped: best.swapped,
    score: best.score,
    confidence,
  };
}
