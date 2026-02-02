import type { StatsBombMatch } from "@/lib/stats/statsbomb";

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

export function getTeamMatchScore(a?: string, b?: string): number {
  const aNorm = normalizeTeamName(a);
  const bNorm = normalizeTeamName(b);
  if (!aNorm.key || !bNorm.key) return 0;

  if (aNorm.key === bNorm.key) return 1;
  if (aNorm.key.includes(bNorm.key) || bNorm.key.includes(aNorm.key)) return 0.9;

  const tokenScore = jaccardSimilarity(aNorm.tokens, bNorm.tokens);
  return Math.min(0.85, tokenScore);
}

export function findBestStatsBombMatch(
  homeName?: string,
  awayName?: string,
  candidates: StatsBombMatch[] = []
): { match?: StatsBombMatch; swapped: boolean; score: number } {
  let bestScore = 0;
  let bestMatch: StatsBombMatch | undefined;
  let bestSwapped = false;

  for (const candidate of candidates) {
    const directScore =
      getTeamMatchScore(candidate.home_team?.home_team_name, homeName) +
      getTeamMatchScore(candidate.away_team?.away_team_name, awayName);
    if (directScore > bestScore) {
      bestScore = directScore;
      bestMatch = candidate;
      bestSwapped = false;
    }

    const swapScore =
      getTeamMatchScore(candidate.home_team?.home_team_name, awayName) +
      getTeamMatchScore(candidate.away_team?.away_team_name, homeName);
    if (swapScore > bestScore) {
      bestScore = swapScore;
      bestMatch = candidate;
      bestSwapped = true;
    }
  }

  const minScore = 1.15;
  if (bestScore < minScore) {
    return { match: undefined, swapped: false, score: bestScore };
  }

  return { match: bestMatch, swapped: bestSwapped, score: bestScore };
}
