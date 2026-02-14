import { NextResponse } from "next/server";
import { getStatsBombCompetitions } from "@/lib/stats/statsbomb";
import { statsApiErrorResponse } from "@/lib/stats/apiError";

export async function GET() {
  try {
    const competitions = await getStatsBombCompetitions();
    return NextResponse.json({
      sport: "football",
      source: "statsbomb_open_data",
      competitions,
    });
  } catch (error) {
    return statsApiErrorResponse(error, "Failed to fetch competitions");
  }
}
