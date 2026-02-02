import { NextResponse } from "next/server";
import { FOOTBALL_DATA_BASE_TIER, getFootballTierMapping, getTierOverrides } from "@/lib/footballTier";

export async function GET() {
  return NextResponse.json({
    source: "football-data.org",
    base: FOOTBALL_DATA_BASE_TIER,
    overrides: getTierOverrides(),
    resolved: getFootballTierMapping(),
  });
}
