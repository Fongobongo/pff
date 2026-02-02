export const NFL_STAT_KEYS = [
  "passing_td",
  "passing_yards",
  "passing_300_plus_bonus",
  "passing_interception",
  "rushing_td",
  "rushing_yards",
  "rushing_100_plus_bonus",
  "receiving_td",
  "receptions",
  "receiving_yards",
  "receiving_100_plus_bonus",
  "return_td",
  "fumble_lost",
  "two_pt_conversion",
  "offensive_fumble_recovery_td",
] as const;

export type NflStatKey = (typeof NFL_STAT_KEYS)[number];
export type NflNormalizedStats = Partial<Record<NflStatKey, number>>;

export const FOOTBALL_STAT_KEYS = [
  "appearance_start",
  "appearance_subbed_on",
  "goals",
  "shots_on_target",
  "shots_blocked_by_opponent",
  "assists",
  "assists_penalties_won",
  "assists_the_assister",
  "big_chances_created",
  "accurate_passes_opponents_half",
  "accurate_passes_own_half",
  "fouls_won",
  "penalties_won",
  "blocked_shots",
  "block_shots_six_yards",
  "duels_won",
  "successful_tackles",
  "last_player_tackles",
  "recoveries",
  "effective_clearances",
  "effective_headed_clearances",
  "interceptions",
  "interceptions_in_box",
  "crosses_blocked",
  "clearances_off_line",
  "saves_penalty",
  "saves_outside_box",
  "saves_inside_box",
  "successful_sweeper_keepers",
  "smothers",
  "punches",
  "catches_cross",
  "pick_ups",
  "six_second_violations",
  "crosses_not_claimed",
  "own_goal",
  "penalty_given_away",
  "red_card",
  "yellow_card",
  "fouls_committed",
  "big_chances_missed",
  "shots_off_target",
  "miscontrols",
  "dispossessions",
  "successful_dribbles",
  "offsides",
  "clean_sheet_45_plus",
  "goals_conceded",
  "duels_lost",
  "errors_leading_to_goal",
  "errors_leading_to_shot",
] as const;

export type FootballStatKey = (typeof FOOTBALL_STAT_KEYS)[number];
export type FootballNormalizedStats = Partial<Record<FootballStatKey, number>>;

export const FOOTBALL_POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
export type FootballPosition = (typeof FOOTBALL_POSITIONS)[number];

export const FOOTBALL_COMPETITION_TIERS = ["A", "B", "C"] as const;
export type FootballCompetitionTier = (typeof FOOTBALL_COMPETITION_TIERS)[number];

export const FOOTBALL_RESULTS = ["win", "draw", "loss"] as const;
export type FootballMatchResult = (typeof FOOTBALL_RESULTS)[number];

export type FootballMatchContext = {
  position: FootballPosition;
  competitionTier?: FootballCompetitionTier;
  result?: FootballMatchResult;
  minutesPlayed?: number;
  bigMatchBonus?: number;
};

export type ScoreItem = {
  key: string;
  quantity: number;
  pointsPer: number;
  total: number;
};

export type ScoreResult = {
  total: number;
  totalRounded: number;
  items: ScoreItem[];
};

export type ScoreOptions = {
  includeZero?: boolean;
  roundDecimals?: number;
};
