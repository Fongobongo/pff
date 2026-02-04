import { NextResponse } from "next/server";
import { fetchNflTeams } from "@/lib/stats/nflverse";

export async function GET() {
  const data = await fetchNflTeams();
  return NextResponse.json({
    sport: "nfl",
    source: "nflverse_data",
    sourceUrl: data.sourceUrl,
    rows: data.rows,
  });
}
