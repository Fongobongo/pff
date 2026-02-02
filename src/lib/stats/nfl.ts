import { NFL_STAT_KEYS, type NflNormalizedStats, type ScoreItem, type ScoreOptions, type ScoreResult } from "@/lib/stats/types";
import { roundToDecimals, toFiniteNumber } from "@/lib/stats/utils";

const NFL_POINTS: Record<string, number> = {
  passing_td: 4,
  passing_yards: 0.04,
  passing_interception: -1,
  rushing_td: 6,
  rushing_yards: 0.1,
  receiving_td: 6,
  receptions: 1,
  receiving_yards: 0.1,
  return_td: 6,
  fumble_lost: -1,
  two_pt_conversion: 2,
  offensive_fumble_recovery_td: 6,
  passing_300_plus_bonus: 3,
  rushing_100_plus_bonus: 3,
  receiving_100_plus_bonus: 3,
};

export function scoreNfl(stats: NflNormalizedStats, options: ScoreOptions = {}): ScoreResult {
  const items: ScoreItem[] = [];
  const includeZero = options.includeZero ?? false;
  const roundDecimals = options.roundDecimals ?? 2;

  const normalizedStats: NflNormalizedStats = { ...stats };
  const passingYards = toFiniteNumber(stats.passing_yards);
  const rushingYards = toFiniteNumber(stats.rushing_yards);
  const receivingYards = toFiniteNumber(stats.receiving_yards);

  if (normalizedStats.passing_300_plus_bonus === undefined) {
    normalizedStats.passing_300_plus_bonus = passingYards >= 300 ? 1 : 0;
  }
  if (normalizedStats.rushing_100_plus_bonus === undefined) {
    normalizedStats.rushing_100_plus_bonus = rushingYards >= 100 ? 1 : 0;
  }
  if (normalizedStats.receiving_100_plus_bonus === undefined) {
    normalizedStats.receiving_100_plus_bonus = receivingYards >= 100 ? 1 : 0;
  }

  for (const key of NFL_STAT_KEYS) {
    const quantity = toFiniteNumber(normalizedStats[key]);
    if (!includeZero && quantity === 0) continue;

    const pointsPer = NFL_POINTS[key] ?? 0;
    const total = quantity * pointsPer;
    items.push({ key, quantity, pointsPer, total });
  }

  const total = items.reduce((sum, item) => sum + item.total, 0);
  return {
    total,
    totalRounded: roundToDecimals(total, roundDecimals),
    items,
  };
}
