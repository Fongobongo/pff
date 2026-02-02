import type { FootballCompetitionTier } from "@/lib/stats/types";

// football-data.org competition codes (best-effort mapping).
const FOOTBALL_DATA_CODE_TIER: Record<string, FootballCompetitionTier> = {
  PL: "A", // Premier League
  CL: "A", // Champions League
  PD: "B", // La Liga
  BL1: "B", // Bundesliga
  SA: "B", // Serie A
  EL: "B", // Europa League
  ECL: "C", // Europa Conference League
  FL1: "C", // Ligue 1
  UNL: "C", // Nations League
  DED: "C", // Eredivisie
  PPL: "C", // Primeira Liga
};

export function resolveCompetitionTierFromFootballData(
  competitionCode?: string
): FootballCompetitionTier | undefined {
  if (!competitionCode) return undefined;
  const key = competitionCode.toUpperCase();
  return FOOTBALL_DATA_CODE_TIER[key];
}
