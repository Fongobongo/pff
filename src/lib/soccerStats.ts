import { getBaseUrl } from "@/lib/serverBaseUrl";

export const SOCCER_COMPETITIONS = [
  { id: 9, seasonId: 281, label: "1. Bundesliga 2023/2024" },
  { id: 9, seasonId: 27, label: "1. Bundesliga 2015/2016" },
  { id: 1267, seasonId: 107, label: "African Cup of Nations 2023" },
  { id: 16, seasonId: 277, label: "Champions League 1972/1973" },
  { id: 16, seasonId: 276, label: "Champions League 1970/1971" },
  { id: 16, seasonId: 76, label: "Champions League 1999/2000" },
  { id: 16, seasonId: 71, label: "Champions League 1971/1972" },
  { id: 16, seasonId: 44, label: "Champions League 2003/2004" },
  { id: 16, seasonId: 41, label: "Champions League 2008/2009" },
  { id: 16, seasonId: 39, label: "Champions League 2006/2007" },
  { id: 16, seasonId: 37, label: "Champions League 2004/2005" },
  { id: 16, seasonId: 27, label: "Champions League 2015/2016" },
  { id: 16, seasonId: 26, label: "Champions League 2014/2015" },
  { id: 16, seasonId: 25, label: "Champions League 2013/2014" },
  { id: 16, seasonId: 24, label: "Champions League 2012/2013" },
  { id: 16, seasonId: 23, label: "Champions League 2011/2012" },
  { id: 16, seasonId: 22, label: "Champions League 2010/2011" },
  { id: 16, seasonId: 21, label: "Champions League 2009/2010" },
  { id: 16, seasonId: 4, label: "Champions League 2018/2019" },
  { id: 16, seasonId: 2, label: "Champions League 2016/2017" },
  { id: 16, seasonId: 1, label: "Champions League 2017/2018" },
  { id: 223, seasonId: 282, label: "Copa America 2024" },
  { id: 87, seasonId: 279, label: "Copa del Rey 1977/1978" },
  { id: 87, seasonId: 268, label: "Copa del Rey 1982/1983" },
  { id: 87, seasonId: 84, label: "Copa del Rey 1983/1984" },
  { id: 37, seasonId: 90, label: "FA Women's Super League 2020/2021" },
  { id: 37, seasonId: 42, label: "FA Women's Super League 2019/2020" },
  { id: 37, seasonId: 4, label: "FA Women's Super League 2018/2019" },
  { id: 1470, seasonId: 274, label: "FIFA U20 World Cup 1979" },
  { id: 43, seasonId: 272, label: "FIFA World Cup 1970" },
  { id: 43, seasonId: 270, label: "FIFA World Cup 1962" },
  { id: 43, seasonId: 269, label: "FIFA World Cup 1958" },
  { id: 43, seasonId: 106, label: "FIFA World Cup 2022" },
  { id: 43, seasonId: 55, label: "FIFA World Cup 1990" },
  { id: 43, seasonId: 54, label: "FIFA World Cup 1986" },
  { id: 43, seasonId: 51, label: "FIFA World Cup 1974" },
  { id: 43, seasonId: 3, label: "FIFA World Cup 2018" },
  { id: 1238, seasonId: 108, label: "Indian Super league 2021/2022" },
  { id: 11, seasonId: 278, label: "La Liga 1973/1974" },
  { id: 11, seasonId: 90, label: "La Liga 2020/2021" },
  { id: 11, seasonId: 42, label: "La Liga 2019/2020" },
  { id: 11, seasonId: 41, label: "La Liga 2008/2009" },
  { id: 11, seasonId: 40, label: "La Liga 2007/2008" },
  { id: 11, seasonId: 39, label: "La Liga 2006/2007" },
  { id: 11, seasonId: 38, label: "La Liga 2005/2006" },
  { id: 11, seasonId: 37, label: "La Liga 2004/2005" },
  { id: 11, seasonId: 27, label: "La Liga 2015/2016" },
  { id: 11, seasonId: 26, label: "La Liga 2014/2015" },
  { id: 11, seasonId: 25, label: "La Liga 2013/2014" },
  { id: 11, seasonId: 24, label: "La Liga 2012/2013" },
  { id: 11, seasonId: 23, label: "La Liga 2011/2012" },
  { id: 11, seasonId: 22, label: "La Liga 2010/2011" },
  { id: 11, seasonId: 21, label: "La Liga 2009/2010" },
  { id: 11, seasonId: 4, label: "La Liga 2018/2019" },
  { id: 11, seasonId: 2, label: "La Liga 2016/2017" },
  { id: 11, seasonId: 1, label: "La Liga 2017/2018" },
  { id: 81, seasonId: 275, label: "Liga Profesional 1981" },
  { id: 81, seasonId: 48, label: "Liga Profesional 1997/1998" },
  { id: 7, seasonId: 235, label: "Ligue 1 2022/2023" },
  { id: 7, seasonId: 108, label: "Ligue 1 2021/2022" },
  { id: 7, seasonId: 27, label: "Ligue 1 2015/2016" },
  { id: 44, seasonId: 107, label: "Major League Soccer 2023" },
  { id: 116, seasonId: 68, label: "North American League 1977" },
  { id: 49, seasonId: 3, label: "NWSL 2018" },
  { id: 2, seasonId: 44, label: "Premier League 2003/2004" },
  { id: 2, seasonId: 27, label: "Premier League 2015/2016" },
  { id: 12, seasonId: 86, label: "Serie A 1986/1987" },
  { id: 12, seasonId: 27, label: "Serie A 2015/2016" },
  { id: 55, seasonId: 282, label: "UEFA Euro 2024" },
  { id: 55, seasonId: 43, label: "UEFA Euro 2020" },
  { id: 35, seasonId: 75, label: "UEFA Europa League 1988/1989" },
  { id: 53, seasonId: 315, label: "UEFA Women's Euro 2025" },
  { id: 53, seasonId: 106, label: "UEFA Women's Euro 2022" },
  { id: 72, seasonId: 107, label: "Women's World Cup 2023" },
  { id: 72, seasonId: 30, label: "Women's World Cup 2019" },
] as const;

export const SOCCER_FEATURED_COMPETITIONS = [
  { id: 2, seasonId: 27, label: "Premier League 2015/2016" },
  { id: 11, seasonId: 90, label: "La Liga 2020/2021" },
  { id: 12, seasonId: 27, label: "Serie A 2015/2016" },
  { id: 9, seasonId: 281, label: "1. Bundesliga 2023/2024" },
  { id: 16, seasonId: 4, label: "Champions League 2018/2019" },
  { id: 7, seasonId: 235, label: "Ligue 1 2022/2023" },
  { id: 43, seasonId: 106, label: "FIFA World Cup 2022" },
  { id: 55, seasonId: 282, label: "UEFA Euro 2024" },
  { id: 223, seasonId: 282, label: "Copa America 2024" },
  { id: 44, seasonId: 107, label: "Major League Soccer 2023" },
  { id: 72, seasonId: 107, label: "Women's World Cup 2023" },
  { id: 37, seasonId: 90, label: "FA Women's Super League 2020/2021" },
] as const;

export type SoccerCompetition = (typeof SOCCER_COMPETITIONS)[number];

export function getFeaturedSoccerCompetitions(current?: { id: number; seasonId: number }): SoccerCompetition[] {
  const featured = [...SOCCER_FEATURED_COMPETITIONS] as SoccerCompetition[];
  if (!current) return featured;
  const exists = featured.some((comp) => comp.id === current.id && comp.seasonId === current.seasonId);
  if (exists) return featured;
  const match = SOCCER_COMPETITIONS.find((comp) => comp.id === current.id && comp.seasonId === current.seasonId);
  return match ? [match, ...featured] : featured;
}

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
  recent?: boolean;
}): Promise<SoccerScoreCompetitionResponse> {
  const baseUrl = await getBaseUrl();
  const query = new URLSearchParams();
  query.set("competition_id", String(params.competitionId));
  query.set("season_id", String(params.seasonId));
  if (params.limit) query.set("limit", String(params.limit));
  query.set("include_players", "1");
  if (params.recent) query.set("recent", "1");

  const res = await fetch(`${baseUrl}/api/stats/football/score-competition?${query.toString()}`, {
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch soccer stats: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as SoccerScoreCompetitionResponse;
}
