export {};

type CliFlags = {
  includeNfl: boolean;
  includeFootball: boolean;
  dryRun: boolean;
};

function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {
    includeNfl: true,
    includeFootball: true,
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      flags.dryRun = true;
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
  }

  return flags;
}

async function main() {
  const runtime = process as typeof process & {
    loadEnvFile?: (filePath?: string) => void;
  };
  runtime.loadEnvFile?.(".env");

  const { syncSportfunGameApiTp } = await import("@/lib/sportfunGameApiTp");

  const flags = parseArgs(process.argv.slice(2));
  console.log("[sportfun-tp-sync-game] starting with flags:", flags);

  const report = await syncSportfunGameApiTp({
    includeNfl: flags.includeNfl,
    includeFootball: flags.includeFootball,
    dryRun: flags.dryRun,
  });

  console.log("[sportfun-tp-sync-game] completed");
  console.log(JSON.stringify(report, null, 2));

  const hasErrors = report.jobs.some((job) => job.status === "error");
  if (hasErrors || !report.configured) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[sportfun-tp-sync-game] failed:", message);
  process.exit(1);
});
