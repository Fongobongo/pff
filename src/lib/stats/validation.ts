import { z } from "zod";
import {
  FOOTBALL_COMPETITION_TIERS,
  FOOTBALL_POSITIONS,
  FOOTBALL_RESULTS,
  FOOTBALL_STAT_KEYS,
  NFL_STAT_KEYS,
} from "@/lib/stats/types";

const numberSchema = z.number().finite();

const nflStatsShape: Record<string, z.ZodTypeAny> = Object.fromEntries(
  NFL_STAT_KEYS.map((key) => [key, numberSchema])
);

const footballStatsShape: Record<string, z.ZodTypeAny> = Object.fromEntries(
  FOOTBALL_STAT_KEYS.map((key) => [key, numberSchema])
);

export const nflStatsSchema = z.object(nflStatsShape).partial();
export const footballStatsSchema = z.object(footballStatsShape).partial();

export const scoreOptionsSchema = z
  .object({
    includeZero: z.boolean().optional(),
    roundDecimals: z.number().int().min(0).max(6).optional(),
  })
  .optional();

export const footballContextSchema = z.object({
  position: z.enum(FOOTBALL_POSITIONS),
  competitionTier: z.enum(FOOTBALL_COMPETITION_TIERS).optional(),
  result: z.enum(FOOTBALL_RESULTS).optional(),
  minutesPlayed: z.number().finite().min(0).optional(),
  bigMatchBonus: z.number().finite().min(0).optional(),
});
