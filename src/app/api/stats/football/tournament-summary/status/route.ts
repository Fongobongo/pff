import { NextResponse } from "next/server";
import { z } from "zod";
import { getJob } from "@/lib/stats/jobs";
import { toCsv } from "@/lib/stats/csv";

const querySchema = z.object({
  job_id: z.string().min(1),
  format: z.enum(["json", "csv"]).optional(),
});

type TournamentSummaryPlayer = {
  playerId: number;
  playerName: string;
  teamName: string;
  position: string;
  games: number;
  totalPoints: number;
  totalRounded: number;
  average: number;
};

type TournamentSummaryResult = {
  competitionId?: number;
  seasonId?: number;
  players?: TournamentSummaryPlayer[];
};

function summaryToCsv(summary: TournamentSummaryResult) {
  const headers = [
    "player_id",
    "player_name",
    "team",
    "position",
    "games",
    "total_points",
    "total_rounded",
    "average",
  ];

  const rows = (summary.players ?? []).map((player) => [
    player.playerId,
    player.playerName,
    player.teamName,
    player.position,
    player.games,
    player.totalPoints,
    player.totalRounded,
    player.average,
  ]);

  return toCsv(headers, rows);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = querySchema.parse({
    job_id: url.searchParams.get("job_id"),
    format: url.searchParams.get("format") ?? undefined,
  });

  const job = await getJob<TournamentSummaryResult>(query.job_id);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  if (query.format === "csv") {
    if (job.status !== "completed" || !job.result) {
      return NextResponse.json(
        {
          status: job.status,
          jobId: job.id,
          matchesTotal: job.total ?? null,
          matchesProcessed: job.processed ?? 0,
          error: job.error,
          message: "CSV not ready yet.",
        },
        { status: 202 }
      );
    }

    const csv = summaryToCsv(job.result);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tournament-summary-${job.result?.competitionId ?? "job"}-${job.result?.seasonId ?? ""}.csv"`,
      },
    });
  }

  return NextResponse.json({
    status: job.status,
    jobId: job.id,
    matchesTotal: job.total ?? null,
    matchesProcessed: job.processed ?? 0,
    error: job.error,
    result: job.status === "completed" ? job.result : undefined,
  });
}
