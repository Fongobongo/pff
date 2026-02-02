import { NextResponse } from "next/server";
import { getStatsBombCompetitions } from "@/lib/stats/statsbomb";

export async function GET() {
  const competitions = await getStatsBombCompetitions();
  return NextResponse.json({
    sport: "football",
    source: "statsbomb_open_data",
    competitions,
  });
}
