export {};

type CliFlags = {
  fromYear?: number;
  toYear?: number;
  maxJobs?: number;
  footballLimit?: number;
  includeNfl: boolean;
  includeFootball: boolean;
  dryRun: boolean;
  refresh: boolean;
  seasonTypes?: string[];
};

function parseNumberFlag(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.trunc(parsed);
}

function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {
    includeNfl: true,
    includeFootball: true,
    dryRun: false,
    refresh: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      flags.dryRun = true;
      continue;
    }
    if (arg === "--refresh") {
      flags.refresh = true;
      continue;
    }
    if (arg === "--no-nfl") {
      flags.includeNfl = false;
      continue;
    }
    if (arg === "--no-football") {
      flags.includeFootball = false;
      continue;
    }
    if (arg.startsWith("--from-year=")) {
      flags.fromYear = parseNumberFlag(arg.slice("--from-year=".length));
      continue;
    }
    if (arg.startsWith("--to-year=")) {
      flags.toYear = parseNumberFlag(arg.slice("--to-year=".length));
      continue;
    }
    if (arg.startsWith("--max-jobs=")) {
      flags.maxJobs = parseNumberFlag(arg.slice("--max-jobs=".length));
      continue;
    }
    if (arg.startsWith("--football-limit=")) {
      flags.footballLimit = parseNumberFlag(arg.slice("--football-limit=".length));
      continue;
    }
    if (arg.startsWith("--nfl-season-types=")) {
      const raw = arg.slice("--nfl-season-types=".length);
      const seasonTypes = raw
        .split(",")
        .map((token) => token.trim().toUpperCase())
        .filter(Boolean);
      flags.seasonTypes = seasonTypes.length ? seasonTypes : undefined;
      continue;
    }
  }

  return flags;
}

async function main() {
  const runtime = process as typeof process & {
    loadEnvFile?: (filePath?: string) => void;
  };
  runtime.loadEnvFile?.(".env");

  const { backfillSportfunTournamentTp } = await import("@/lib/sportfunTournamentTpBackfill");

  const flags = parseArgs(process.argv.slice(2));
  console.log("[sportfun-tp-backfill] starting with flags:", flags);

  const report = await backfillSportfunTournamentTp({
    fromYear: flags.fromYear,
    toYear: flags.toYear,
    maxJobs: flags.maxJobs,
    footballLimit: flags.footballLimit,
    includeNfl: flags.includeNfl,
    includeFootball: flags.includeFootball,
    nflSeasonTypes: flags.seasonTypes,
    dryRun: flags.dryRun,
    refresh: flags.refresh,
    onProgress: ({ index, total, job }) => {
      console.log(`[sportfun-tp-backfill] ${index}/${total} ${job.key}`);
    },
  });

  console.log("[sportfun-tp-backfill] completed");
  console.log(JSON.stringify(report, null, 2));

  const hasErrors = report.jobs.some((job) => job.status === "error");
  if (hasErrors) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[sportfun-tp-backfill] failed:", message);
  process.exit(1);
});
