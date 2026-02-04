import { getBaseUrl } from "@/lib/serverBaseUrl";

export const SOCCER_COMPETITIONS = [
  { id: 2, seasonId: 27, label: "Premier League 2015/2016" },
  { id: 9, seasonId: 281, label: "Bundesliga 2023/2024" },
  { id: 11, seasonId: 1, label: "La Liga 2003/2004" },
] as const;

export type SoccerScorePlayer = {
  playerId: number;
  playerName: string;
  teamName?: string;
  position: string;
  minutesPlayed?: number;
  matchResult?: string;
  stats?: Record<string, number>;
  score?: { total?: number; totalRounded?: number };
};

export type SoccerScoreMatch = {
  matchId: number;
  matchDate?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: number;
  awayScore?: number;
  players: SoccerScorePlayer[];
};

export type SoccerScoreCompetitionResponse = {
  competitionId: number;
  seasonId: number;
  competitionTier?: string;
  matchCount: number;
  matches: SoccerScoreMatch[];
};

export async function fetchSoccerCompetitionScores(params: {
  competitionId: number;
  seasonId: number;
  limit?: number;
}): Promise<SoccerScoreCompetitionResponse> {
  const baseUrl = await getBaseUrl();
  const query = new URLSearchParams();
  query.set("competition_id", String(params.competitionId));
  query.set("season_id", String(params.seasonId));
  if (params.limit) query.set("limit", String(params.limit));
  query.set("include_players", "1");

  const res = await fetch(`${baseUrl}/api/stats/football/score-competition?${query.toString()}`, {
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch soccer stats: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as SoccerScoreCompetitionResponse;
}
