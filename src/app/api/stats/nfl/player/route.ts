import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchNflWeeklyStats } from "@/lib/stats/nflverse";
import { scoreNfl } from "@/lib/stats/nfl";
import { toCsv } from "@/lib/stats/csv";

const querySchema = z.object({
  season: z.coerce.number().int().min(1999),
  player_id: z.string().min(1),
  season_type: z.string().optional(),
  week: z.coerce.number().int().min(1).max(25).optional(),
  format: z.enum(["json", "csv"]).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = querySchema.parse({
    season: url.searchParams.get("season"),
    player_id: url.searchParams.get("player_id"),
    season_type: url.searchParams.get("season_type") ?? undefined,
    week: url.searchParams.get("week") ?? undefined,
    format: url.searchParams.get("format") ?? undefined,
  });

  const data = await fetchNflWeeklyStats({
    season: query.season,
    seasonType: query.season_type,
    playerId: query.player_id,
    week: query.week,
  });

  const rows = data.rows
    .map((row) => ({
      ...row,
      score: scoreNfl(row.stats),
    }))
    .sort((a, b) => a.week - b.week);

  const totalPoints = rows.reduce((sum, row) => sum + (row.score?.total ?? 0), 0);
  const totalRounded = rows.reduce((sum, row) => sum + (row.score?.totalRounded ?? 0), 0);
  const games = rows.length;
  const average = games > 0 ? totalPoints / games : 0;
  const bestWeek = rows.reduce(
    (best, row) => ((row.score?.total ?? 0) > (best?.score?.total ?? 0) ? row : best),
    rows[0]
  );

  const player = rows[0]
    ? {
        playerId: rows[0].player_id,
        playerName: rows[0].player_name,
        displayName: rows[0].player_display_name,
        position: rows[0].position,
        team: rows[0].team,
      }
    : { playerId: query.player_id };

  if (query.format === "csv") {
    const headers = [
      "season",
      "week",
      "season_type",
      "team",
      "opponent_team",
      "position",
      "score_total",
      "score_total_rounded",
      "passing_yards",
      "passing_td",
      "passing_interception",
      "rushing_yards",
      "rushing_td",
      "receiving_yards",
      "receiving_td",
      "receptions",
      "return_td",
      "fumble_lost",
      "two_pt_conversion",
      "offensive_fumble_recovery_td",
    ];

    const csvRows = rows.map((row) => [
      row.season,
      row.week,
      row.season_type,
      row.team,
      row.opponent_team,
      row.position,
      row.score?.total ?? "",
      row.score?.totalRounded ?? "",
      row.stats.passing_yards ?? 0,
      row.stats.passing_td ?? 0,
      row.stats.passing_interception ?? 0,
      row.stats.rushing_yards ?? 0,
      row.stats.rushing_td ?? 0,
      row.stats.receiving_yards ?? 0,
      row.stats.receiving_td ?? 0,
      row.stats.receptions ?? 0,
      row.stats.return_td ?? 0,
      row.stats.fumble_lost ?? 0,
      row.stats.two_pt_conversion ?? 0,
      row.stats.offensive_fumble_recovery_td ?? 0,
    ]);

    const csv = toCsv(headers, csvRows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="nfl-player-${query.player_id}-${query.season}.csv"`,
      },
    });
  }

  return NextResponse.json({
    sport: "nfl",
    season: query.season,
    seasonType: query.season_type,
    week: query.week,
    player,
    coverage: data.coverage,
    summary: {
      games,
      totalPoints,
      totalRounded,
      average,
      bestWeek: bestWeek?.week,
      bestScore: bestWeek?.score?.totalRounded ?? bestWeek?.score?.total,
    },
    rows,
  });
}
