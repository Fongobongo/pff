import type { FootballCompetitionTier } from "@/lib/stats/types";
import { env } from "@/lib/env";

// football-data.org competition codes (best-effort mapping).
export const FOOTBALL_DATA_BASE_TIER: Record<string, FootballCompetitionTier> = {
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

export function parseTierOverrides(
  value?: string
): Partial<Record<string, FootballCompetitionTier>> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, FootballCompetitionTier>;
    const entries = Object.entries(parsed).filter(
      ([key, tier]) =>
        typeof key === "string" && (tier === "A" || tier === "B" || tier === "C")
    );
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

export function getTierOverrides(): Partial<Record<string, FootballCompetitionTier>> {
  return parseTierOverrides(env.FOOTBALL_TIER_OVERRIDES);
}

export function getFootballTierMapping(): Record<string, FootballCompetitionTier> {
  return {
    ...FOOTBALL_DATA_BASE_TIER,
    ...getTierOverrides(),
  };
}

export function resolveCompetitionTierFromFootballData(
  competitionCode?: string
): FootballCompetitionTier | undefined {
  if (!competitionCode) return undefined;
  const key = competitionCode.toUpperCase();
  return getFootballTierMapping()[key];
}
