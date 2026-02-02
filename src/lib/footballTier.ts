import type { FootballCompetitionTier } from "@/lib/stats/types";

const FOOTBALL_DATA_CODE_TIER: Record<string, FootballCompetitionTier> = {
  PL: "A",
  CL: "A",
  PD: "B",
  BL1: "B",
  SA: "B",
  EL: "B",
  FL1: "C",
  UNL: "C",
};

export function resolveCompetitionTierFromFootballData(
  competitionCode?: string
): FootballCompetitionTier | undefined {
  if (!competitionCode) return undefined;
  const key = competitionCode.toUpperCase();
  return FOOTBALL_DATA_CODE_TIER[key];
}
