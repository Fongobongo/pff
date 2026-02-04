import { getBaseUrl } from "@/lib/serverBaseUrl";

export const SOCCER_COMPETITIONS = [
  { id: 2, seasonId: 27, label: "Premier League 2015/2016" },
  { id: 2, seasonId: 44, label: "Premier League 2003/2004" },
  { id: 11, seasonId: 42, label: "La Liga 2019/2020" },
  { id: 12, seasonId: 27, label: "Serie A 2015/2016" },
  { id: 7, seasonId: 235, label: "Ligue 1 2022/2023" },
  { id: 9, seasonId: 281, label: "1. Bundesliga 2023/2024" },
  { id: 16, seasonId: 4, label: "Champions League 2018/2019" },
  { id: 43, seasonId: 106, label: "FIFA World Cup 2022" },
  { id: 44, seasonId: 107, label: "MLS 2023" },
  { id: 223, seasonId: 282, label: "Copa America 2024" },
] as const;

export type SoccerScorePlayer = {
  playerId: number;
  playerName: string;
  teamName?: string;
  position: string;
  minutesPlayed?: number;
  matchResult?: string;
  stats?: Record<string, number>;
  xg?: number;
  xa?: number;
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
