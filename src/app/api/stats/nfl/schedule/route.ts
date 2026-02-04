import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchNflSchedule } from "@/lib/stats/nflverse";

const querySchema = z.object({
  season: z.coerce.number().int().min(1999),
  week: z.coerce.number().int().min(0).max(25).optional(),
  game_type: z.string().optional(),
  team: z.string().optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = querySchema.parse({
    season: url.searchParams.get("season"),
    week: url.searchParams.get("week") ?? undefined,
    game_type: url.searchParams.get("game_type") ?? undefined,
    team: url.searchParams.get("team") ?? undefined,
  });

  const data = await fetchNflSchedule();
  const gameType = query.game_type?.toUpperCase();
  const team = query.team?.toUpperCase();

  const seasonRows = data.rows.filter((row) => row.season === query.season);
  const typedRows = gameType ? seasonRows.filter((row) => (row.gameType ?? "").toUpperCase() === gameType) : seasonRows;

  const weeks = Array.from(
    new Set(typedRows.map((row) => row.week).filter((value): value is number => value !== undefined))
  ).sort((a, b) => a - b);

  let filtered = typedRows;
  if (query.week !== undefined) {
    filtered = filtered.filter((row) => row.week === query.week);
  }
  if (team) {
    filtered = filtered.filter(
      (row) => (row.homeTeam ?? "").toUpperCase() === team || (row.awayTeam ?? "").toUpperCase() === team
    );
  }

  filtered = filtered.slice().sort((a, b) => {
    const weekDelta = (a.week ?? 0) - (b.week ?? 0);
    if (weekDelta !== 0) return weekDelta;
    const dateA = a.gameday ?? "";
    const dateB = b.gameday ?? "";
    return dateA.localeCompare(dateB);
  });

  return NextResponse.json({
    sport: "nfl",
    source: "nflverse_data",
    season: query.season,
    week: query.week ?? null,
    gameType: gameType ?? null,
    team: team ?? null,
    sourceUrl: data.sourceUrl,
    weeks,
    rows: filtered,
  });
}
