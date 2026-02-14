import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isSportfunGameApiTpConfigured,
  syncSportfunGameApiTp,
  triggerSportfunGameApiTpSync,
} from "@/lib/sportfunGameApiTp";

export const runtime = "nodejs";

const querySchema = z.object({
  include_nfl: z.string().optional(),
  include_football: z.string().optional(),
  dry_run: z.string().optional(),
  force: z.string().optional(),
  min_interval_seconds: z.coerce.number().int().min(0).max(24 * 3600).optional(),
});

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

async function runSync(request: Request) {
  const url = new URL(request.url);
  const query = querySchema.parse({
    include_nfl: url.searchParams.get("include_nfl") ?? undefined,
    include_football: url.searchParams.get("include_football") ?? undefined,
    dry_run: url.searchParams.get("dry_run") ?? undefined,
    force: url.searchParams.get("force") ?? undefined,
    min_interval_seconds: url.searchParams.get("min_interval_seconds") ?? undefined,
  });

  const includeNfl = parseBool(query.include_nfl, true);
  const includeFootball = parseBool(query.include_football, true);
  const dryRun = parseBool(query.dry_run, false);
  const force = parseBool(query.force, false);
  const minIntervalMs = query.min_interval_seconds !== undefined ? query.min_interval_seconds * 1000 : undefined;

  const configured = isSportfunGameApiTpConfigured();
  if (!configured) {
    return NextResponse.json(
      {
        ok: false,
        configured,
        error: "SPORTFUN_AUTH_BEARER_TOKEN is not configured",
      },
      { status: 503 }
    );
  }

  const report = force || dryRun
    ? await syncSportfunGameApiTp({
        includeNfl,
        includeFootball,
        dryRun,
      })
    : await triggerSportfunGameApiTpSync({
        includeNfl,
        includeFootball,
        minIntervalMs,
        force,
      });

  if (!report) {
    return NextResponse.json({
      ok: true,
      configured,
      skipped: true,
      reason: "throttled_by_min_interval",
      minIntervalMs,
    });
  }

  const hasError = report.jobs.some((job) => job.status === "error");
  return NextResponse.json(
    {
      ok: !hasError,
      configured,
      report,
    },
    {
      status: hasError ? 502 : 200,
    }
  );
}

export async function GET(request: Request) {
  return runSync(request);
}

export async function POST(request: Request) {
  return runSync(request);
}
