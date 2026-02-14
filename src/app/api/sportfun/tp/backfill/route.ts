import { NextResponse } from "next/server";
import { z } from "zod";
import {
  backfillSportfunTournamentTp,
  type SportfunTournamentTpBackfillOptions,
} from "@/lib/sportfunTournamentTpBackfill";
import { isSportfunTournamentTpStoreConfigured } from "@/lib/sportfunTournamentTp";

export const runtime = "nodejs";

const querySchema = z.object({
  from_year: z.coerce.number().int().min(2000).max(2100).optional(),
  to_year: z.coerce.number().int().min(2000).max(2100).optional(),
  include_nfl: z.string().optional(),
  include_football: z.string().optional(),
  nfl_season_types: z.string().optional(),
  football_limit: z.coerce.number().int().min(1).max(1000).optional(),
  max_jobs: z.coerce.number().int().min(1).max(500).optional(),
  refresh: z.string().optional(),
  dry_run: z.string().optional(),
});

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseBackfillOptions(request: Request): SportfunTournamentTpBackfillOptions {
  const url = new URL(request.url);
  const query = querySchema.parse({
    from_year: url.searchParams.get("from_year") ?? undefined,
    to_year: url.searchParams.get("to_year") ?? undefined,
    include_nfl: url.searchParams.get("include_nfl") ?? undefined,
    include_football: url.searchParams.get("include_football") ?? undefined,
    nfl_season_types: url.searchParams.get("nfl_season_types") ?? undefined,
    football_limit: url.searchParams.get("football_limit") ?? undefined,
    max_jobs: url.searchParams.get("max_jobs") ?? undefined,
    refresh: url.searchParams.get("refresh") ?? undefined,
    dry_run: url.searchParams.get("dry_run") ?? undefined,
  });

  const seasonTypes = query.nfl_season_types
    ? query.nfl_season_types
        .split(",")
        .map((token) => token.trim().toUpperCase())
        .filter(Boolean)
    : undefined;

  return {
    fromYear: query.from_year,
    toYear: query.to_year,
    includeNfl: parseBool(query.include_nfl, true),
    includeFootball: parseBool(query.include_football, true),
    nflSeasonTypes: seasonTypes,
    footballLimit: query.football_limit,
    maxJobs: query.max_jobs,
    refresh: parseBool(query.refresh, false),
    dryRun: parseBool(query.dry_run, false),
  };
}

async function runBackfill(request: Request) {
  const options = parseBackfillOptions(request);
  const report = await backfillSportfunTournamentTp(options);
  return NextResponse.json({
    ok: report.jobs.every((job) => job.status !== "error"),
    storeConfigured: isSportfunTournamentTpStoreConfigured(),
    options,
    report,
  });
}

export async function GET(request: Request) {
  return runBackfill(request);
}

export async function POST(request: Request) {
  return runBackfill(request);
}
