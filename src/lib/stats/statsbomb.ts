import { withCache } from "@/lib/stats/cache";
import type { FootballMatchResult, FootballNormalizedStats, FootballPosition } from "@/lib/stats/types";
import { toFiniteNumber } from "@/lib/stats/utils";

const STATSBOMB_BASE_URL = "https://raw.githubusercontent.com/statsbomb/open-data/master/data";

export type StatsBombCompetition = {
  competition_id: number;
  season_id: number;
  country_name?: string;
  competition_name: string;
  competition_gender?: string;
  season_name?: string;
};

export type StatsBombMatch = {
  match_id: number;
  match_date?: string;
  home_score?: number;
  away_score?: number;
  home_team?: { home_team_id: number; home_team_name: string };
  away_team?: { away_team_id: number; away_team_name: string };
};

export type StatsBombPlayerStats = {
  playerId: number;
  playerName: string;
  teamId: number;
  teamName: string;
  position: FootballPosition;
  minutesPlayed: number;
  matchResult?: FootballMatchResult;
  stats: FootballNormalizedStats;
};

export type StatsBombMatchStats = {
  matchId: number;
  competitionId?: number;
  seasonId?: number;
  teams?: {
    homeTeamId?: number;
    awayTeamId?: number;
    homeScore?: number;
    awayScore?: number;
  };
  players: StatsBombPlayerStats[];
  coverage: {
    mappedFields: string[];
    unmappedFields: string[];
  };
};

async function fetchJson<T>(url: string, revalidateSeconds: number): Promise<T> {
  const res = await fetch(url, { next: { revalidate: revalidateSeconds } });
  if (!res.ok) {
    throw new Error(`StatsBomb request failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function getStatsBombCompetitions(): Promise<StatsBombCompetition[]> {
  return withCache("statsbomb:competitions", 86400, () =>
    fetchJson<StatsBombCompetition[]>(`${STATSBOMB_BASE_URL}/competitions.json`, 86400)
  );
}

export async function getStatsBombMatches(
  competitionId: number,
  seasonId: number
): Promise<StatsBombMatch[]> {
  return withCache(`statsbomb:matches:${competitionId}:${seasonId}`, 3600, () =>
    fetchJson<StatsBombMatch[]>(
      `${STATSBOMB_BASE_URL}/matches/${competitionId}/${seasonId}.json`,
      3600
    )
  );
}

async function getStatsBombEvents(matchId: number): Promise<any[]> {
  return withCache(`statsbomb:events:${matchId}`, 3600, () =>
    fetchJson<any[]>(`${STATSBOMB_BASE_URL}/events/${matchId}.json`, 3600)
  );
}

async function getStatsBombLineups(matchId: number): Promise<any[]> {
  return withCache(`statsbomb:lineups:${matchId}`, 3600, () =>
    fetchJson<any[]>(`${STATSBOMB_BASE_URL}/lineups/${matchId}.json`, 3600)
  );
}

function parseMinutes(value?: string, fallbackMinutes = 90): number {
  if (!value) return fallbackMinutes;
  const parts = value.split(":");
  if (parts.length < 2) return fallbackMinutes;
  const minutes = Number(parts[0]);
  const seconds = Number(parts[1]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return fallbackMinutes;
  return minutes + seconds / 60;
}

function mapPosition(positionName?: string): FootballPosition {
  if (!positionName) return "MID";
  const name = positionName.toLowerCase();
  if (name.includes("goalkeeper")) return "GK";
  if (name.includes("back") || name.includes("defender") || name.includes("full")) return "DEF";
  if (name.includes("midfield")) return "MID";
  return "FWD";
}

function normalizeCardName(cardName?: string): "yellow" | "red" | null {
  if (!cardName) return null;
  const value = cardName.toLowerCase();
  if (value.includes("second yellow")) return "red";
  if (value.includes("red")) return "red";
  if (value.includes("yellow")) return "yellow";
  return null;
}

function ensureStats(
  map: Map<number, StatsBombPlayerStats>,
  playerId: number,
  fallback: {
    playerName?: string;
    teamId?: number;
    teamName?: string;
  }
): StatsBombPlayerStats {
  const existing = map.get(playerId);
  if (existing) return existing;

  const stats: StatsBombPlayerStats = {
    playerId,
    playerName: fallback.playerName ?? "Unknown",
    teamId: fallback.teamId ?? 0,
    teamName: fallback.teamName ?? "Unknown",
    position: "MID",
    minutesPlayed: 0,
    stats: {},
  };

  map.set(playerId, stats);
  return stats;
}

function addStat(player: StatsBombPlayerStats, key: keyof FootballNormalizedStats, amount = 1) {
  const current = toFiniteNumber(player.stats[key]);
  player.stats[key] = current + amount;
}

function applyMatchResults(
  players: StatsBombPlayerStats[],
  match?: StatsBombMatch
): { homeTeamId?: number; awayTeamId?: number; homeScore?: number; awayScore?: number } | undefined {
  if (!match?.home_team || !match?.away_team) return undefined;

  const homeScore = toFiniteNumber(match.home_score);
  const awayScore = toFiniteNumber(match.away_score);
  const homeTeamId = match.home_team.home_team_id;
  const awayTeamId = match.away_team.away_team_id;

  let homeResult: FootballMatchResult = "draw";
  let awayResult: FootballMatchResult = "draw";
  if (homeScore > awayScore) {
    homeResult = "win";
    awayResult = "loss";
  } else if (awayScore > homeScore) {
    homeResult = "loss";
    awayResult = "win";
  }

  for (const player of players) {
    if (player.teamId === homeTeamId) {
      player.matchResult = homeResult;
    } else if (player.teamId === awayTeamId) {
      player.matchResult = awayResult;
    }
  }

  return { homeTeamId, awayTeamId, homeScore, awayScore };
}

export async function buildStatsBombMatchStats(options: {
  matchId: number;
  competitionId?: number;
  seasonId?: number;
}): Promise<StatsBombMatchStats> {
  const { matchId, competitionId, seasonId } = options;
  const [events, lineups, matches] = await Promise.all([
    getStatsBombEvents(matchId),
    getStatsBombLineups(matchId),
    competitionId && seasonId ? getStatsBombMatches(competitionId, seasonId) : Promise.resolve(undefined),
  ]);

  const players = new Map<number, StatsBombPlayerStats>();

  for (const team of lineups ?? []) {
    const teamId = team.team_id ?? 0;
    const teamName = team.team_name ?? "Unknown";
    for (const player of team.lineup ?? []) {
      const playerId = player.player_id ?? 0;
      if (!playerId) continue;

      const info = ensureStats(players, playerId, {
        playerName: player.player_name,
        teamId,
        teamName,
      });

      const positions = Array.isArray(player.positions) ? player.positions : [];
      if (positions.length > 0) {
        info.position = mapPosition(positions[0]?.position);
        let minutes = 0;
        let started = false;
        let subbedOn = false;
        for (const pos of positions) {
          const startReason = String(pos?.start_reason ?? "");
          if (startReason === "Starting XI") started = true;
          if (startReason.toLowerCase().includes("sub")) subbedOn = true;
          const from = parseMinutes(pos?.from, 0);
          const to = parseMinutes(pos?.to, 90);
          minutes += Math.max(0, to - from);
        }
        info.minutesPlayed = minutes;
        if (started) addStat(info, "appearance_start", 1);
        if (subbedOn) addStat(info, "appearance_subbed_on", 1);
      }
    }
  }

  for (const event of events ?? []) {
    const playerId = event.player?.id ?? event.player?.player_id ?? event.player_id;
    if (!playerId) continue;

    const player = ensureStats(players, playerId, {
      playerName: event.player?.name,
      teamId: event.team?.id,
      teamName: event.team?.name,
    });

    const typeName = event.type?.name;

    if (typeName === "Shot") {
      const outcome = event.shot?.outcome?.name;
      const outcomeText = String(outcome ?? "");
      if (outcomeText === "Goal") addStat(player, "goals", 1);
      if (outcomeText.toLowerCase().includes("own")) addStat(player, "own_goal", 1);

      const onTarget = ["Goal", "Saved", "Saved to Post"].includes(outcomeText);
      const offTarget = ["Off T", "Wayward", "Post"].includes(outcomeText);
      if (onTarget) addStat(player, "shots_on_target", 1);
      if (offTarget) addStat(player, "shots_off_target", 1);
      if (outcomeText === "Blocked") addStat(player, "shots_blocked_by_opponent", 1);
    }

    if (typeName === "Pass") {
      const isComplete = !event.pass?.outcome;
      if (isComplete) {
        const startX = event.location?.[0];
        if (typeof startX === "number") {
          if (startX < 60) {
            addStat(player, "accurate_passes_own_half", 1);
          } else {
            addStat(player, "accurate_passes_opponents_half", 1);
          }
        }
      }

      if (event.pass?.goal_assist) {
        addStat(player, "assists", 1);
      } else if (event.pass?.shot_assist) {
        addStat(player, "assists_the_assister", 1);
      }
    }

    if (typeName === "Foul Won") {
      addStat(player, "fouls_won", 1);
      if (event.foul_won?.penalty) {
        addStat(player, "penalties_won", 1);
      }
    }

    if (typeName === "Foul Committed") {
      addStat(player, "fouls_committed", 1);
      if (event.foul_committed?.penalty) {
        addStat(player, "penalty_given_away", 1);
      }
    }

    const foulCard = event.foul_committed?.card?.name;
    const behaviourCard = event.bad_behaviour?.card?.name;
    const card = normalizeCardName(foulCard ?? behaviourCard);
    if (card === "yellow") addStat(player, "yellow_card", 1);
    if (card === "red") addStat(player, "red_card", 1);

    if (typeName === "Miscontrol") {
      addStat(player, "miscontrols", 1);
    }

    if (typeName === "Dispossessed") {
      addStat(player, "dispossessions", 1);
    }

    if (typeName === "Duel") {
      const outcomeName = event.duel?.outcome?.name;
      if (outcomeName === "Won") addStat(player, "duels_won", 1);
      if (outcomeName === "Lost") addStat(player, "duels_lost", 1);

      const duelType = event.duel?.type?.name;
      if (duelType === "Tackle" && outcomeName === "Won") {
        addStat(player, "successful_tackles", 1);
      }
    }

    if (typeName === "Ball Recovery") {
      addStat(player, "recoveries", 1);
    }

    if (typeName === "Interception") {
      addStat(player, "interceptions", 1);
      const locationX = event.location?.[0];
      if (typeof locationX === "number" && locationX >= 102) {
        addStat(player, "interceptions_in_box", 1);
      }
    }

    if (typeName === "Clearance") {
      addStat(player, "effective_clearances", 1);
      const bodyPart = event.clearance?.body_part?.name ?? "";
      if (bodyPart.toLowerCase().includes("head")) {
        addStat(player, "effective_headed_clearances", 1);
      }
    }

    if (typeName === "Block") {
      addStat(player, "blocked_shots", 1);
    }

    if (typeName === "Goal Keeper") {
      const keeperType = String(event.goalkeeper?.type?.name ?? "");
      if (keeperType.includes("Penalty Saved")) {
        addStat(player, "saves_penalty", 1);
      } else if (keeperType.includes("Shot")) {
        addStat(player, "saves_inside_box", 1);
      }

      if (keeperType.toLowerCase().includes("smother")) addStat(player, "smothers", 1);
      if (keeperType.toLowerCase().includes("punch")) addStat(player, "punches", 1);
      if (keeperType.toLowerCase().includes("claim")) addStat(player, "catches_cross", 1);
      if (keeperType.toLowerCase().includes("sweeper")) addStat(player, "successful_sweeper_keepers", 1);
      if (keeperType.toLowerCase().includes("pick")) addStat(player, "pick_ups", 1);
    }

    if (typeName === "Dribble") {
      const outcomeName = event.dribble?.outcome?.name;
      if (outcomeName === "Complete") {
        addStat(player, "successful_dribbles", 1);
      }
    }

    if (typeName === "Offside") {
      addStat(player, "offsides", 1);
    }
  }

  const playerArray = Array.from(players.values());
  const match = matches?.find((item) => item.match_id === matchId);
  const teamSummary = applyMatchResults(playerArray, match);

  const mappedFields = [
    "appearance_start",
    "appearance_subbed_on",
    "goals",
    "shots_on_target",
    "shots_off_target",
    "shots_blocked_by_opponent",
    "assists",
    "assists_the_assister",
    "accurate_passes_opponents_half",
    "accurate_passes_own_half",
    "fouls_won",
    "penalties_won",
    "blocked_shots",
    "duels_won",
    "successful_tackles",
    "recoveries",
    "effective_clearances",
    "effective_headed_clearances",
    "interceptions",
    "interceptions_in_box",
    "saves_penalty",
    "saves_inside_box",
    "successful_sweeper_keepers",
    "smothers",
    "punches",
    "catches_cross",
    "pick_ups",
    "own_goal",
    "penalty_given_away",
    "red_card",
    "yellow_card",
    "fouls_committed",
    "miscontrols",
    "dispossessions",
    "successful_dribbles",
    "offsides",
    "duels_lost",
  ];

  const unmappedFields = [
    "assists_penalties_won",
    "big_chances_created",
    "big_chances_missed",
    "block_shots_six_yards",
    "last_player_tackles",
    "crosses_blocked",
    "clearances_off_line",
    "saves_outside_box",
    "six_second_violations",
    "crosses_not_claimed",
    "clean_sheet_45_plus",
    "goals_conceded",
    "errors_leading_to_goal",
    "errors_leading_to_shot",
  ];

  return {
    matchId,
    competitionId,
    seasonId,
    teams: teamSummary,
    players: playerArray,
    coverage: { mappedFields, unmappedFields },
  };
}
