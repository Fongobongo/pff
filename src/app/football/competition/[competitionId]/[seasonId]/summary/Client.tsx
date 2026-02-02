"use client";

import { useEffect, useMemo, useState } from "react";

type JobStatus = "pending" | "running" | "completed" | "failed";

type SummaryPlayer = {
  playerId: number;
  playerName: string;
  teamName: string;
  position: string;
  games: number;
  totalPoints: number;
  totalRounded: number;
  average: number;
};

type Summary = {
  competitionId: number;
  seasonId: number;
  competitionTier?: string;
  matchesProcessed: number;
  players: SummaryPlayer[];
};

type JobState = {
  id: string;
  status: JobStatus;
  matchesProcessed: number;
  matchesTotal: number | null;
  error?: string;
};

export default function TournamentSummaryClient({
  competitionId,
  seasonId,
  limit,
  top,
}: {
  competitionId: string;
  seasonId: string;
  limit?: string;
  top?: string;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const topValue = top ?? "50";
  const limitValue = limit ?? "";

  const queryString = useMemo(() => {
    const query = new URLSearchParams();
    query.set("competition_id", competitionId);
    query.set("season_id", seasonId);
    query.set("top", topValue);
    if (limitValue) query.set("limit", limitValue);
    if (refreshToken > 0) query.set("refresh", "true");
    return query.toString();
  }, [competitionId, seasonId, limitValue, refreshToken, topValue]);

  const csvLink = useMemo(() => {
    const query = new URLSearchParams();
    query.set("competition_id", competitionId);
    query.set("season_id", seasonId);
    query.set("top", topValue);
    if (limitValue) query.set("limit", limitValue);
    query.set("format", "csv");
    return `/api/stats/football/tournament-summary?${query.toString()}`;
  }, [competitionId, seasonId, limitValue, topValue]);

  useEffect(() => {
    let cancelled = false;
    async function loadSummary() {
      setError(null);
      const res = await fetch(`/api/stats/football/tournament-summary?${queryString}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (cancelled) return;
      if (data?.players) {
        setSummary(data);
        setJob(null);
        return;
      }

      if (data?.jobId) {
        setSummary(null);
        setJob({
          id: data.jobId,
          status: data.status ?? "pending",
          matchesProcessed: data.matchesProcessed ?? 0,
          matchesTotal: data.matchesTotal ?? null,
        });
        return;
      }

      setError("Не удалось загрузить summary.");
    }

    loadSummary();
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  useEffect(() => {
    if (!job || job.status === "completed" || job.status === "failed") return;
    let cancelled = false;
    const interval = window.setInterval(async () => {
      const res = await fetch(
        `/api/stats/football/tournament-summary/status?job_id=${job.id}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (cancelled) return;
      if (data?.result) {
        setSummary(data.result);
        setJob(null);
        return;
      }
      setJob({
        id: job.id,
        status: data.status ?? job.status,
        matchesProcessed: data.matchesProcessed ?? job.matchesProcessed,
        matchesTotal: data.matchesTotal ?? job.matchesTotal,
        error: data.error,
      });
      if (data?.status === "failed") {
        setError(data.error ?? "Job failed.");
      }
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [job]);

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
        <button
          className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
          onClick={() => setRefreshToken((token) => token + 1)}
        >
          Refresh summary
        </button>
        {summary ? (
          <a
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            href={csvLink}
          >
            Export CSV
          </a>
        ) : null}
        {job ? (
          <span>
            Status: {job.status} · {job.matchesProcessed} / {job.matchesTotal ?? "?"}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {summary ? (
        <>
          <section className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            Matches processed: {summary.matchesProcessed ?? 0} · Top: {topValue}
          </section>

          <div className="mt-6 overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Pos</th>
                  <th className="px-3 py-2">Games</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Avg</th>
                </tr>
              </thead>
              <tbody>
                {(summary.players ?? []).map((player) => (
                  <tr key={player.playerId} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-black dark:text-white">{player.playerName}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{player.teamName}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{player.position}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{player.games}</td>
                    <td className="px-3 py-2 text-black dark:text-white">
                      {Number(player.totalRounded ?? player.totalPoints).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {Number(player.average ?? 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-xl border border-black/10 bg-white p-4 text-sm text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
          {job
            ? "Summary считается в фоне. Можно оставить вкладку открытой."
            : "Загружаем данные..."}
        </div>
      )}
    </section>
  );
}
