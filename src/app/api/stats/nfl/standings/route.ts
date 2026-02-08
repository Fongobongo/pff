import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchNflSchedule, fetchNflTeams } from "@/lib/stats/nflverse";
import { getSportfunMarketSnapshot } from "@/lib/sportfunMarket";
import { computeNflTeamEconomicsRows, type NflTeamEconomicsAsset } from "@/lib/nfl/teamEconomics";

const querySchema = z.object({
  season: z.coerce.number().int().min(1999),
  week: z.coerce.number().int().min(0).max(25).optional(),
  game_type: z.string().optional(),
});

type StandingRow = {
  teamAbbr: string;
  teamName?: string;
  conference?: string;
  division?: string;
  wins: number;
  losses: number;
  ties: number;
  games: number;
  winPct: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  logo?: string;
  tradeablePlayers: number;
  squadValueUsd: number;
  avgPlayerPriceUsd: number;
  topAssets: NflTeamEconomicsAsset[];
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = querySchema.parse({
    season: url.searchParams.get("season"),
    week: url.searchParams.get("week") ?? undefined,
    game_type: url.searchParams.get("game_type") ?? undefined,
  });

  const [schedule, teams, market] = await Promise.all([
    fetchNflSchedule(),
    fetchNflTeams(),
    getSportfunMarketSnapshot({
      sport: "nfl",
      windowHours: 24,
      trendDays: 30,
      maxTokens: 1000,
    }),
  ]);
  const gameType = query.game_type?.toUpperCase() ?? "REG";
  const economicsRows = computeNflTeamEconomicsRows({
    teams: teams.rows,
    tokens: market.tokens,
  });
  const economicsByTeam = new Map(economicsRows.map((row) => [row.teamAbbr, row]));

  const teamMeta = new Map(
    teams.rows.map((team) => [
      team.teamAbbr,
      {
        teamName: team.teamName,
        conference: team.conference,
        division: team.division,
        logo: team.logoEspn ?? team.logoSquared ?? team.logoWikipedia,
      },
    ])
  );

  const standings = new Map<string, StandingRow>();

  function ensureTeam(teamAbbr: string) {
    let entry = standings.get(teamAbbr);
    if (!entry) {
      const meta = teamMeta.get(teamAbbr);
      entry = {
        teamAbbr,
        teamName: meta?.teamName,
        conference: meta?.conference,
        division: meta?.division,
        wins: 0,
        losses: 0,
        ties: 0,
        games: 0,
        winPct: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDiff: 0,
        logo: meta?.logo,
        tradeablePlayers: 0,
        squadValueUsd: 0,
        avgPlayerPriceUsd: 0,
        topAssets: [],
      };
      standings.set(teamAbbr, entry);
    }
    return entry;
  }

  for (const team of teams.rows) {
    ensureTeam(team.teamAbbr);
  }

  const seasonRows = schedule.rows.filter((row) => row.season === query.season);
  const typedRows = seasonRows.filter((row) => (row.gameType ?? "").toUpperCase() === gameType);
  const weekLimit = query.week;
  const weekRows = weekLimit !== undefined ? typedRows.filter((row) => (row.week ?? 0) <= weekLimit) : typedRows;

  for (const game of weekRows) {
    if (game.homeTeam === undefined || game.awayTeam === undefined) continue;
    if (game.homeScore === undefined || game.awayScore === undefined) continue;

    const home = ensureTeam(game.homeTeam);
    const away = ensureTeam(game.awayTeam);

    home.games += 1;
    away.games += 1;
    home.pointsFor += game.homeScore;
    home.pointsAgainst += game.awayScore;
    away.pointsFor += game.awayScore;
    away.pointsAgainst += game.homeScore;

    if (game.homeScore > game.awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else if (game.homeScore < game.awayScore) {
      away.wins += 1;
      home.losses += 1;
    } else {
      home.ties += 1;
      away.ties += 1;
    }
  }

  const rows = Array.from(standings.values()).map((entry) => {
    const winPct = entry.games > 0 ? (entry.wins + entry.ties * 0.5) / entry.games : 0;
    const economics = economicsByTeam.get(entry.teamAbbr);
    return {
      ...entry,
      winPct: Number(winPct.toFixed(3)),
      pointDiff: entry.pointsFor - entry.pointsAgainst,
      tradeablePlayers: economics?.tradeablePlayers ?? 0,
      squadValueUsd: economics?.squadValueUsd ?? 0,
      avgPlayerPriceUsd: economics?.avgPlayerPriceUsd ?? 0,
      topAssets: economics?.topAssets ?? [],
    };
  });

  rows.sort((a, b) => {
    if (b.winPct !== a.winPct) return b.winPct - a.winPct;
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    return a.teamAbbr.localeCompare(b.teamAbbr);
  });

  return NextResponse.json(
    {
      sport: "nfl",
      source: "nflverse_data",
      season: query.season,
      week: query.week ?? null,
      gameType,
      sourceUrl: schedule.sourceUrl,
      asOf: market.asOf,
      rows,
    },
    {
      headers: {
        "cache-control": "s-maxage=120, stale-while-revalidate=600",
      },
    }
  );
}
