# Stats Normalization (Draft)

This document captures scoring rules and a normalized stats schema for NFL and Football (soccer).
It is based on the Sport.fun scoring matrices and edge-case notes.

## NFL

### Scoring rules (normalized fields)

All positions score the same for each action (no positional, win, or time bonuses).

- passing_td: +4
- passing_yards: +0.04 per yard (25 yards = 1 point)
- passing_300_plus_bonus: +3 (one-time bonus at >= 300 passing yards)
- passing_interception: -1
- rushing_td: +6
- rushing_yards: +0.1 per yard (10 yards = 1 point)
- rushing_100_plus_bonus: +3 (one-time bonus at >= 100 rushing yards)
- receiving_td: +6
- receptions: +1
- receiving_yards: +0.1 per yard (10 yards = 1 point)
- receiving_100_plus_bonus: +3 (one-time bonus at >= 100 receiving yards)
- return_td: +6 (punt/kickoff/FG return)
- fumble_lost: -1
- two_pt_conversion: +2 (pass/run/catch)
- offensive_fumble_recovery_td: +6

### Cut-off + edge notes

- Scores lock 1 hour after a game finishes.
- Scoring is pulled from SportRadar (source of truth).
- Cancelled/postponed mid-game: keep current score for the tournament.
- If a game is restarted within the same tournament dates, the higher score from the two games counts.
- Tie-breakers: average of last 5 scores; random if still tied.
- Injury cover system (2025 season): if a player is ruled OUT before kickoff, the top projected backup at the same position scores on their behalf. In-game injuries do not trigger the cover.

### Derived/validation rules

- passing_300_plus_bonus triggers when passing_yards >= 300.
- rushing_100_plus_bonus triggers when rushing_yards >= 100.
- receiving_100_plus_bonus triggers when receiving_yards >= 100.

## Football (soccer)

### Scoring rules

Score = Base Points + Positional Points (if any) per action.
Positions: GK (Goalkeeper), DEF (Defender), MID (Midfielder), FWD (Forward).

Base-only actions (same for all positions; some are GK-only in practice):
- appearance_start: +10
- appearance_subbed_on: +5
- goals: +50
- shots_on_target: +10
- shots_blocked_by_opponent: +3
- assists: +30
- assists_penalties_won: +30
- assists_the_assister: +10
- big_chances_created: +10
- accurate_passes_opponents_half: +0.75
- accurate_passes_own_half: +0.25
- fouls_won: +2
- penalties_won: +10
- blocked_shots: +5
- block_shots_six_yards: +8
- duels_won: +3
- successful_tackles: +3
- last_player_tackles: +10
- recoveries: +2
- effective_clearances: +1
- effective_headed_clearances: +1
- interceptions: +3
- interceptions_in_box: +5
- crosses_blocked: +2
- clearances_off_line: +20
- saves_penalty: +30
- saves_outside_box: +3
- saves_inside_box: +5
- successful_sweeper_keepers: +3
- smothers: +3
- punches: +3
- catches_cross: +3
- pick_ups: +1
- six_second_violations: -5
- crosses_not_claimed: -5
- own_goal: -20
- penalty_given_away: -20
- red_card: -20
- yellow_card: -10
- fouls_committed: -3

Base + positional modifiers:
- big_chances_missed: base -10; MID -3; FWD -5
- shots_off_target: base 0; MID -1; FWD -3
- miscontrols: base 0; GK -5; DEF -5; MID -3; FWD -1
- dispossessions: base 0; GK -5; DEF -5; MID -3; FWD -1
- successful_dribbles: base 3; MID +1; FWD +2
- offsides: base 0; MID -3; FWD -3
- clean_sheet_45_plus: base 0; GK +40; DEF +30; MID +10
- goals_conceded: base 0; GK -5; DEF -5; MID -3
- duels_lost: base 0; GK -3; DEF -3; MID -2; FWD -1
- errors_leading_to_goal: base 0; GK -20; DEF -20; MID -10; FWD -10
- errors_leading_to_shot: base 0; GK -10; DEF -10; MID -5; FWD -5

### Wins and draws (competition-tiered)

Win/draw bonuses depend on competition tier, with a maximum win bonus of 30.

- Tier A (Champions League Knockouts, English Premier League): win +30, draw +15
- Tier B (La Liga, Bundesliga, Serie A, Champions League League Stage, Europa League Knockouts): win +20, draw +10
- Tier C (Ligue 1, Nations League): win +10, draw +5

Big match modifier: when two high-ranked teams face off, the win bonus can be boosted but is capped at 30.

Competition rankings are based on OPTA Power Rankings (team strength based on real-life performances) and club transfer market value. These rankings are updated periodically.

### Cut-off + edge notes

- Scores lock at midnight UTC after the final game of the tournament.
- Cancelled/postponed mid-game: keep current score for the tournament.
- If a match is restarted within the same tournament dates, the higher score from the two games counts.
- If a player plays less than 45 minutes, win/draw bonus points are halved.
- Scoring continues through Extra Time, but stops at the start of a penalty shootout.
- If a player wins a penalty and then scores it, they receive goal points but no assist points.
- Clean sheet bonus applies to the entire team even if a player is subbed off before a goal is conceded.

### Tie-breaking (tournament ranking)

- Scores are recorded to two decimal places.
- If scores tie, the average of the last 5 scores is used.
- If still tied, a random selection decides.

## Normalization guidance

- Store raw provider stat names and map to the normalized fields above.
- Normalize units to match scoring rules (yards, minutes, shots, etc.).
- Keep per-game stat snapshots so we can re-score if rules change.
- Keep positional info per match to apply positional modifiers correctly.
