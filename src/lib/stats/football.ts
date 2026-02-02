import {
  FOOTBALL_STAT_KEYS,
  type FootballMatchContext,
  type FootballNormalizedStats,
  type FootballPosition,
  type ScoreItem,
  type ScoreOptions,
  type ScoreResult,
} from "@/lib/stats/types";
import { roundToDecimals, toFiniteNumber } from "@/lib/stats/utils";

const FOOTBALL_BASE_POINTS: Record<string, number> = {
  appearance_start: 10,
  appearance_subbed_on: 5,
  goals: 50,
  shots_on_target: 10,
  shots_blocked_by_opponent: 3,
  assists: 30,
  assists_penalties_won: 30,
  assists_the_assister: 10,
  big_chances_created: 10,
  accurate_passes_opponents_half: 0.75,
  accurate_passes_own_half: 0.25,
  fouls_won: 2,
  penalties_won: 10,
  blocked_shots: 5,
  block_shots_six_yards: 8,
  duels_won: 3,
  successful_tackles: 3,
  last_player_tackles: 10,
  recoveries: 2,
  effective_clearances: 1,
  effective_headed_clearances: 1,
  interceptions: 3,
  interceptions_in_box: 5,
  crosses_blocked: 2,
  clearances_off_line: 20,
  saves_penalty: 30,
  saves_outside_box: 3,
  saves_inside_box: 5,
  successful_sweeper_keepers: 3,
  smothers: 3,
  punches: 3,
  catches_cross: 3,
  pick_ups: 1,
  six_second_violations: -5,
  crosses_not_claimed: -5,
  own_goal: -20,
  penalty_given_away: -20,
  red_card: -20,
  yellow_card: -10,
  fouls_committed: -3,
  big_chances_missed: -10,
  shots_off_target: 0,
  miscontrols: 0,
  dispossessions: 0,
  successful_dribbles: 3,
  offsides: 0,
  clean_sheet_45_plus: 0,
  goals_conceded: 0,
  duels_lost: 0,
  errors_leading_to_goal: 0,
  errors_leading_to_shot: 0,
};

const FOOTBALL_POSITION_MODIFIERS: Record<string, Record<FootballPosition, number>> = {
  big_chances_missed: { GK: 0, DEF: 0, MID: -3, FWD: -5 },
  shots_off_target: { GK: 0, DEF: 0, MID: -1, FWD: -3 },
  miscontrols: { GK: -5, DEF: -5, MID: -3, FWD: -1 },
  dispossessions: { GK: -5, DEF: -5, MID: -3, FWD: -1 },
  successful_dribbles: { GK: 0, DEF: 0, MID: 1, FWD: 2 },
  offsides: { GK: 0, DEF: 0, MID: -3, FWD: -3 },
  clean_sheet_45_plus: { GK: 40, DEF: 30, MID: 10, FWD: 0 },
  goals_conceded: { GK: -5, DEF: -5, MID: -3, FWD: 0 },
  duels_lost: { GK: -3, DEF: -3, MID: -2, FWD: -1 },
  errors_leading_to_goal: { GK: -20, DEF: -20, MID: -10, FWD: -10 },
  errors_leading_to_shot: { GK: -10, DEF: -10, MID: -5, FWD: -5 },
};

const FOOTBALL_TIER_BONUS = {
  A: { win: 30, draw: 15 },
  B: { win: 20, draw: 10 },
  C: { win: 10, draw: 5 },
} as const;

function getWinDrawBonus(context: FootballMatchContext): number {
  if (!context.result || context.result === "loss" || !context.competitionTier) return 0;

  let bonus = FOOTBALL_TIER_BONUS[context.competitionTier][context.result];
  const extra = toFiniteNumber(context.bigMatchBonus);
  if (extra > 0) {
    bonus = Math.min(30, bonus + extra);
  }

  if (context.minutesPlayed !== undefined && context.minutesPlayed < 45) {
    bonus = bonus / 2;
  }

  return bonus;
}

export function scoreFootball(
  stats: FootballNormalizedStats,
  context: FootballMatchContext,
  options: ScoreOptions = {}
): ScoreResult {
  const items: ScoreItem[] = [];
  const includeZero = options.includeZero ?? false;
  const roundDecimals = options.roundDecimals ?? 2;

  for (const key of FOOTBALL_STAT_KEYS) {
    const quantity = toFiniteNumber(stats[key]);
    if (!includeZero && quantity === 0) continue;

    const base = FOOTBALL_BASE_POINTS[key] ?? 0;
    const modifier = FOOTBALL_POSITION_MODIFIERS[key]?.[context.position] ?? 0;
    const pointsPer = base + modifier;
    const total = quantity * pointsPer;
    items.push({ key, quantity, pointsPer, total });
  }

  const winDrawBonus = getWinDrawBonus(context);
  if (includeZero || winDrawBonus !== 0) {
    items.push({
      key: "result_bonus",
      quantity: 1,
      pointsPer: winDrawBonus,
      total: winDrawBonus,
    });
  }

  const total = items.reduce((sum, item) => sum + item.total, 0);
  return {
    total,
    totalRounded: roundToDecimals(total, roundDecimals),
    items,
  };
}
