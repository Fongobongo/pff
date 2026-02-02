import { NextResponse } from "next/server";
import { z } from "zod";
import { scoreFootball } from "@/lib/stats/football";
import { footballContextSchema, footballStatsSchema, scoreOptionsSchema } from "@/lib/stats/validation";

const bodySchema = z.object({
  stats: footballStatsSchema,
  context: footballContextSchema,
  options: scoreOptionsSchema,
});

export async function POST(request: Request) {
  const body = bodySchema.parse(await request.json());
  const result = scoreFootball(body.stats, body.context, body.options ?? {});

  return NextResponse.json({
    sport: "football",
    ...result,
  });
}
