import { NextResponse } from "next/server";
import { z } from "zod";
import { scoreNfl } from "@/lib/stats/nfl";
import { nflStatsSchema, scoreOptionsSchema } from "@/lib/stats/validation";

const bodySchema = z.object({
  stats: nflStatsSchema,
  options: scoreOptionsSchema,
});

export async function POST(request: Request) {
  const body = bodySchema.parse(await request.json());
  const result = scoreNfl(body.stats, body.options ?? {});

  return NextResponse.json({
    sport: "nfl",
    ...result,
  });
}
