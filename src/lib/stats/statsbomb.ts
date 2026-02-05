import { withCache } from "@/lib/stats/cache";
import { kvEnabled, kvGetJson, kvSetJson } from "@/lib/kv";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db";
import { statsbombMatchStats } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  FOOTBALL_STAT_KEYS,
  type FootballCompetitionTier,
  type FootballMatchResult,
  type FootballNormalizedStats,
  type FootballPosition,
} from "@/lib/stats/types";
import { toFiniteNumber } from "@/lib/stats/utils";

const STATSBOMB_BASE_URL = "https://raw.githubusercontent.com/statsbomb/open-data/master/data";
const STATSBOMB_TABLE_NAME = "statsbomb_match_stats";

let statsbombTableReady = false;

async function ensureStatsbombTable(): Promise<void> {
  if (statsbombTableReady) return;
  if (!env.DATABASE_URL) return;
  try {
    const db = getDb();
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ${sql.raw(STATSBOMB_TABLE_NAME)} (
        match_id integer PRIMARY KEY,
        competition_id integer,
        season_id integer,
        match_date text,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    statsbombTableReady = true;
  } catch {
    // best-effort; fall back to cache if DB isn't available
  }
}

async function getMatchStatsFromDb(matchId: number): Promise<StatsBombMatchStats | null> {
  if (!env.DATABASE_URL) return null;
  try {
    await ensureStatsbombTable();
    const db = getDb();
    const rows = await db
      .select({ payload: statsbombMatchStats.payload })
      .from(statsbombMatchStats)
      .where(eq(statsbombMatchStats.matchId, matchId))
      .limit(1);
    return (rows[0]?.payload as StatsBombMatchStats | undefined) ?? null;
  } catch {
    return null;
  }
}

async function saveMatchStatsToDb(params: {
  matchId: number;
  competitionId?: number;
  seasonId?: number;
  matchDate?: string;
  payload: StatsBombMatchStats;
}): Promise<void> {
  if (!env.DATABASE_URL) return;
  try {
    await ensureStatsbombTable();
    const db = getDb();
    await db
      .insert(statsbombMatchStats)
      .values({
        matchId: params.matchId,
        competitionId: params.competitionId,
        seasonId: params.seasonId,
        matchDate: params.matchDate,
        payload: params.payload,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: statsbombMatchStats.matchId,
        set: {
          competitionId: params.competitionId,
          seasonId: params.seasonId,
          matchDate: params.matchDate,
          payload: params.payload,
          updatedAt: new Date(),
        },
      });
  } catch {
    // ignore persistence errors
  }
}

export const STATSBOMB_MAPPED_FIELDS = [
  "appearance_start",
  "appearance_subbed_on",
  "goals",
  "shots_on_target",
  "shots_off_target",
  "shots_blocked_by_opponent",
  "big_chances_created",
  "big_chances_missed",
  "assists",
  "assists_penalties_won",
  "assists_the_assister",
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
  "crosses_not_claimed",
  "clean_sheet_45_plus",
  "goals_conceded",
  "errors_leading_to_goal",
  "errors_leading_to_shot",
] as const;

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

type StatsBombEvent = {
  id?: string;
  index?: number;
  minute?: number;
  second?: number;
  possession?: number;
  player_id?: number;
  type?: { name?: string };
  team?: { id?: number; name?: string };
  player?: { id?: number; player_id?: number; name?: string };
  shot?: {
    outcome?: { name?: string };
    statsbomb_xg?: number;
    type?: { name?: string };
  };
  pass?: {
    outcome?: { name?: string };
    goal_assist?: boolean;
    shot_assist?: boolean;
    type?: { name?: string };
    assisted_shot_id?: string;
  };
  foul_won?: { penalty?: boolean };
  foul_committed?: { penalty?: boolean; card?: { name?: string } };
  bad_behaviour?: { card?: { name?: string } };
  duel?: { outcome?: { name?: string }; type?: { name?: string } };
  dribble?: { outcome?: { name?: string } };
  clearance?: { body_part?: { name?: string } };
  goalkeeper?: { type?: { name?: string }; outcome?: { name?: string } };
  related_events?: string[];
  location?: [number, number];
};

type StatsBombLineup = {
  team_id?: number;
  team_name?: string;
  lineup?: Array<{
    player_id?: number;
    player_name?: string;
    positions?: Array<{
      position?: string;
      start_reason?: string;
      from?: string;
      to?: string;
    }>;
  }>;
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
  xg?: number;
  xa?: number;
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
    scoringMissing: string[];
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

const TIER_A_COMPETITIONS = new Set(["premier league", "champions league", "english premier league"]);
const TIER_B_COMPETITIONS = new Set(["la liga", "1. bundesliga", "serie a", "uefa europa league"]);
const TIER_C_COMPETITIONS = new Set(["ligue 1", "uefa nations league"]);

function resolveCompetitionTier(name?: string): FootballCompetitionTier | undefined {
  if (!name) return undefined;
  const key = name.toLowerCase();
  if (TIER_A_COMPETITIONS.has(key)) return "A";
  if (TIER_B_COMPETITIONS.has(key)) return "B";
  if (TIER_C_COMPETITIONS.has(key)) return "C";
  return undefined;
}

export async function getCompetitionTierById(
  competitionId: number
): Promise<FootballCompetitionTier | undefined> {
  const competitions = await getStatsBombCompetitions();
  const competition = competitions.find((item) => item.competition_id === competitionId);
  return resolveCompetitionTier(competition?.competition_name);
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

async function getStatsBombEvents(matchId: number): Promise<StatsBombEvent[]> {
  return withCache(`statsbomb:events:${matchId}`, 3600, () =>
    fetchJson<StatsBombEvent[]>(`${STATSBOMB_BASE_URL}/events/${matchId}.json`, 3600)
  );
}

async function getStatsBombLineups(matchId: number): Promise<StatsBombLineup[]> {
  return withCache(`statsbomb:lineups:${matchId}`, 3600, () =>
    fetchJson<StatsBombLineup[]>(`${STATSBOMB_BASE_URL}/lineups/${matchId}.json`, 3600)
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

function getEventMinute(event: StatsBombEvent): number {
  const minute = toFiniteNumber(event?.minute);
  const second = toFiniteNumber(event?.second);
  return minute + second / 60;
}

function isOwnGoalOutcome(outcomeText: string): boolean {
  return outcomeText.toLowerCase().includes("own");
}

function isGoalOutcome(outcomeText: string): boolean {
  const value = outcomeText.toLowerCase();
  return value === "goal" || value.includes("own");
}

function findPenaltyAssistCandidate(
  penaltyWins: Array<{
    playerId: number;
    teamId: number;
    possession?: number;
    minute: number;
    index: number;
  }>,
  teamId: number,
  shotIndex: number,
  shotMinute: number,
  shotPossession?: number
): number {
  let bestIdx = -1;
  let bestEventIndex = -1;

  for (let i = 0; i < penaltyWins.length; i += 1) {
    const candidate = penaltyWins[i];
    if (candidate.teamId !== teamId) continue;
    if (candidate.index >= shotIndex) continue;

    const minuteDelta = shotMinute - candidate.minute;
    if (minuteDelta < 0 || minuteDelta > PENALTY_ASSIST_MAX_MINUTES) continue;

    if (shotPossession !== undefined && candidate.possession !== undefined) {
      const possessionDelta = shotPossession - candidate.possession;
      if (possessionDelta < 0 || possessionDelta > PENALTY_ASSIST_MAX_POSSESSION_DELTA) continue;
    }

    if (candidate.index > bestEventIndex) {
      bestEventIndex = candidate.index;
      bestIdx = i;
    }
  }

  return bestIdx;
}

function mapPosition(positionName?: string): FootballPosition {
  if (!positionName) return "MID";
  const name = positionName.toLowerCase();
  if (name.includes("goalkeeper")) return "GK";
  if (name.includes("back") || name.includes("defender") || name.includes("full")) return "DEF";
  if (name.includes("midfield")) return "MID";
  return "FWD";
}

const BIG_CHANCE_XG_THRESHOLD = 0.3;
const BOX_START_X = 102;
const SIX_YARD_BOX_X = 114;
const GOAL_LINE_X = 119;
const PENALTY_ASSIST_MAX_MINUTES = 10;
const PENALTY_ASSIST_MAX_POSSESSION_DELTA = 2;

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
    xg: 0,
    xa: 0,
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
  const cacheKey = `statsbomb:match-stats:${matchId}:${competitionId ?? "na"}:${seasonId ?? "na"}`;
  if (kvEnabled()) {
    const kvCached = await kvGetJson<StatsBombMatchStats>(cacheKey);
    if (kvCached) return kvCached;
  }
  return withCache(cacheKey, 3600, async () => {
    const dbCached = await getMatchStatsFromDb(matchId);
    if (dbCached) {
      if (kvEnabled()) {
        void kvSetJson(cacheKey, dbCached);
      }
      return dbCached;
    }

    const [events, lineups, matches] = await Promise.all([
      getStatsBombEvents(matchId),
      getStatsBombLineups(matchId),
      competitionId && seasonId ? getStatsBombMatches(competitionId, seasonId) : Promise.resolve(undefined),
    ]);

    const players = new Map<number, StatsBombPlayerStats>();
    const eventsById = new Map<string, StatsBombEvent>();
    const shotsById = new Map<string, StatsBombEvent>();
    const intervalsByPlayer = new Map<number, { start: number; end: number }[]>();
    const penaltyWins: Array<{
      playerId: number;
      teamId: number;
      possession?: number;
      minute: number;
      index: number;
    }> = [];
    const teamIds = new Set<number>();

    for (const event of events ?? []) {
      if (event?.id) {
        eventsById.set(event.id, event);
        if (event.type?.name === "Shot") {
          shotsById.set(event.id, event);
        }
      }
      if (event?.team?.id) {
        teamIds.add(event.team.id);
      }
    }

    let matchEndMinutes = 90;
    for (const event of events ?? []) {
      matchEndMinutes = Math.max(matchEndMinutes, getEventMinute(event));
    }

    for (const team of lineups ?? []) {
      const teamId = team.team_id ?? 0;
      const teamName = team.team_name ?? "Unknown";
      if (teamId) teamIds.add(teamId);
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
          const intervals: { start: number; end: number }[] = [];
          for (const pos of positions) {
            const startReason = String(pos?.start_reason ?? "");
            if (startReason === "Starting XI") started = true;
            if (startReason.toLowerCase().includes("sub")) subbedOn = true;
            const from = parseMinutes(pos?.from, 0);
            const to = parseMinutes(pos?.to, matchEndMinutes);
            const end = Math.max(from, to);
            intervals.push({ start: from, end });
            minutes += Math.max(0, end - from);
          }
          info.minutesPlayed = minutes;
          if (started) addStat(info, "appearance_start", 1);
          if (subbedOn) addStat(info, "appearance_subbed_on", 1);
          intervalsByPlayer.set(playerId, intervals);
        }
      }
    }

    for (let i = 0; i < (events ?? []).length; i += 1) {
      const event = events[i];
      const eventIndex = typeof event?.index === "number" ? event.index : i;
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

        const xg = toFiniteNumber(event.shot?.statsbomb_xg);
        if (xg > 0) {
          player.xg = (player.xg ?? 0) + xg;
        }
        if (xg >= BIG_CHANCE_XG_THRESHOLD && outcomeText !== "Goal") {
          addStat(player, "big_chances_missed", 1);
        }

        const shotType = event.shot?.type?.name;
        if (shotType === "Penalty") {
          const teamId = event.team?.id ?? player.teamId;
          const shotMinute = getEventMinute(event);
          const shotPossession =
            typeof event.possession === "number" ? event.possession : undefined;
          const candidateIndex = findPenaltyAssistCandidate(
            penaltyWins,
            teamId,
            eventIndex,
            shotMinute,
            shotPossession
          );

          if (candidateIndex >= 0) {
            const winner = penaltyWins.splice(candidateIndex, 1)[0];
            const isGoal = outcomeText === "Goal";
            if (isGoal && winner.playerId !== player.playerId) {
              const winnerPlayer = players.get(winner.playerId);
              if (winnerPlayer) addStat(winnerPlayer, "assists_penalties_won", 1);
            }
          }
        }
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
      }

      if (event.pass?.goal_assist) {
        addStat(player, "assists", 1);
      } else if (event.pass?.shot_assist) {
        addStat(player, "assists_the_assister", 1);
      }

      const passType = event.pass?.type?.name;
      if (passType === "Cross" && event.pass?.outcome?.name === "Blocked") {
        addStat(player, "crosses_blocked", 1);
      }

      const assistedShotId = event.pass?.assisted_shot_id;
      if (assistedShotId) {
        const shot = shotsById.get(assistedShotId);
        const xg = toFiniteNumber(shot?.shot?.statsbomb_xg);
        if (xg > 0) {
          player.xa = (player.xa ?? 0) + xg;
        }
        if (xg >= BIG_CHANCE_XG_THRESHOLD) {
          addStat(player, "big_chances_created", 1);
        }
      }
    }

    if (typeName === "Foul Won") {
      addStat(player, "fouls_won", 1);
      if (event.foul_won?.penalty) {
        addStat(player, "penalties_won", 1);
        penaltyWins.push({
          playerId: player.playerId,
          teamId: event.team?.id ?? player.teamId,
          possession: typeof event.possession === "number" ? event.possession : undefined,
          minute: getEventMinute(event),
          index: eventIndex,
        });
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
        const locationX = event.location?.[0];
        if (typeof locationX === "number" && locationX >= 108) {
          addStat(player, "last_player_tackles", 1);
        }
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
      const locationX = event.location?.[0];
      if (typeof locationX === "number" && locationX >= GOAL_LINE_X) {
        addStat(player, "clearances_off_line", 1);
      }
    }

    if (typeName === "Block") {
      addStat(player, "blocked_shots", 1);
      const locationX = event.location?.[0];
      if (typeof locationX === "number" && locationX >= SIX_YARD_BOX_X) {
        addStat(player, "block_shots_six_yards", 1);
      }
    }

    if (typeName === "Goal Keeper") {
      const keeperType = String(event.goalkeeper?.type?.name ?? "");
      if (keeperType.includes("Penalty Saved")) {
        addStat(player, "saves_penalty", 1);
      } else if (keeperType.includes("Shot")) {
        const relatedShotId = Array.isArray(event.related_events)
          ? event.related_events.find((id: string) => shotsById.has(id))
          : undefined;
        const shot = relatedShotId ? shotsById.get(relatedShotId) : undefined;
        const shotX = shot?.location?.[0];
        if (typeof shotX === "number" && shotX < BOX_START_X) {
          addStat(player, "saves_outside_box", 1);
        } else {
          addStat(player, "saves_inside_box", 1);
        }
      }

      if (keeperType.toLowerCase().includes("smother")) addStat(player, "smothers", 1);
      if (keeperType.toLowerCase().includes("punch")) addStat(player, "punches", 1);
      if (keeperType.toLowerCase().includes("claim")) addStat(player, "catches_cross", 1);
      if (keeperType.toLowerCase().includes("sweeper")) addStat(player, "successful_sweeper_keepers", 1);
      if (keeperType.toLowerCase().includes("pick")) addStat(player, "pick_ups", 1);
      if (keeperType.toLowerCase().includes("six")) addStat(player, "six_second_violations", 1);
      if (keeperType.toLowerCase().includes("violation")) addStat(player, "six_second_violations", 1);

      const keeperOutcome = String(event.goalkeeper?.outcome?.name ?? "");
      if (keeperOutcome === "Fail" || keeperOutcome === "In Play Danger") {
        addStat(player, "crosses_not_claimed", 1);
      }
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

    if (typeName === "Error") {
      const relatedEvents = Array.isArray(event.related_events) ? event.related_events : [];
      let relatedShot: StatsBombEvent | undefined;
      for (const relatedId of relatedEvents) {
        const rel = eventsById.get(relatedId);
        if (rel?.type?.name === "Shot") {
          relatedShot = rel;
          break;
        }
      }
      if (relatedShot) {
        const outcomeName = relatedShot.shot?.outcome?.name;
        if (outcomeName === "Goal") {
          addStat(player, "errors_leading_to_goal", 1);
        } else {
          addStat(player, "errors_leading_to_shot", 1);
        }
      }
    }
  }

  const playerArray = Array.from(players.values());
  const match = matches?.find((item) => item.match_id === matchId);
  const teamSummary = applyMatchResults(playerArray, match);

  for (const player of playerArray) {
    if (!intervalsByPlayer.has(player.playerId) && player.minutesPlayed > 0) {
      intervalsByPlayer.set(player.playerId, [{ start: 0, end: matchEndMinutes }]);
    }
  }

  const goalsConcededByPlayer = new Map<number, number>();
  const teamIdList = Array.from(teamIds.values());
  const playersByTeam = new Map<number, StatsBombPlayerStats[]>();
  for (const player of playerArray) {
    const list = playersByTeam.get(player.teamId) ?? [];
    list.push(player);
    playersByTeam.set(player.teamId, list);
  }

  for (const event of events ?? []) {
    if (event.type?.name !== "Shot") continue;
    const outcomeText = String(event.shot?.outcome?.name ?? "");
    if (!isGoalOutcome(outcomeText)) continue;

    const rawTeamId = event.team?.id;
    if (!rawTeamId) continue;
    const isOwnGoal = isOwnGoalOutcome(outcomeText);
    let scoringTeamId = rawTeamId;
    if (isOwnGoal && teamIdList.length === 2) {
      scoringTeamId = teamIdList.find((id) => id !== rawTeamId) ?? rawTeamId;
    }

    const goalMinute = getEventMinute(event);
    for (const [teamId, teamPlayers] of playersByTeam) {
      if (teamId === scoringTeamId) continue;
      for (const player of teamPlayers) {
        const intervals = intervalsByPlayer.get(player.playerId);
        if (!intervals || intervals.length === 0) continue;
        const onPitch = intervals.some(
          (interval) => goalMinute >= interval.start && goalMinute <= interval.end
        );
        if (!onPitch) continue;
        const prev = goalsConcededByPlayer.get(player.playerId) ?? 0;
        goalsConcededByPlayer.set(player.playerId, prev + 1);
      }
    }
  }

  for (const player of playerArray) {
    const conceded = goalsConcededByPlayer.get(player.playerId) ?? 0;
    if (conceded > 0) addStat(player, "goals_conceded", conceded);
    if (player.minutesPlayed >= 45 && conceded === 0) {
      addStat(player, "clean_sheet_45_plus", 1);
    }
  }

  const result = {
    matchId,
    competitionId,
    seasonId,
    teams: teamSummary,
    players: playerArray,
    coverage: {
      mappedFields: [...STATSBOMB_MAPPED_FIELDS],
      unmappedFields: [],
      scoringMissing: FOOTBALL_STAT_KEYS.filter((key) => !STATSBOMB_MAPPED_FIELDS.includes(key)),
    },
  };
  if (kvEnabled()) {
    void kvSetJson(cacheKey, result);
  }
  void saveMatchStatsToDb({
    matchId,
    competitionId,
    seasonId,
    matchDate: match?.match_date,
    payload: result,
  });
  return result;
  });
}
