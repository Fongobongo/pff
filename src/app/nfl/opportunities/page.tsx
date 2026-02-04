import Link from "next/link";
import { getBaseUrl } from "@/lib/serverBaseUrl";
import NflPageShell from "../_components/NflPageShell";

const SAMPLE_SEASONS = [2021, 2022, 2023];
const SEASON_TYPES = ["REG", "POST", "PRE"] as const;
const TOP_LIMIT = 50;
const PREV_RANK_THRESHOLD = 150;

type ScheduleResponse = {
  weeks: number[];
};

type ScoreWeekRow = {
  player_id: string;
  player_display_name: string;
  team?: string;
  position?: string;
  score?: {
    total?: number;
    totalRounded?: number;
  };
};

type ScoreWeekResponse = {
  rows: ScoreWeekRow[];
};

type OpportunityRow = {
  playerId: string;
  name: string;
  team?: string;
  position?: string;
  currentScore: number;
  previousScore: number;
  delta: number;
  previousRank?: number;
};

function scoreValue(row: ScoreWeekRow): number {
  const val = row.score?.totalRounded ?? row.score?.total ?? 0;
  return Number(val) || 0;
}

function buildQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export default async function NflOpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; week?: string; season_type?: string }>;
}) {
  const params = await searchParams;
  const rawSeason = Number(params.season ?? "2023");
  const season = Number.isFinite(rawSeason) ? rawSeason : 2023;
  const seasonType = (params.season_type ?? "REG").toUpperCase();
  const rawWeek = params.week ? Number(params.week) : undefined;
  const requestedWeek = rawWeek !== undefined && Number.isFinite(rawWeek) ? rawWeek : undefined;

  const baseUrl = await getBaseUrl();
  const scheduleRes = await fetch(
    `${baseUrl}/api/stats/nfl/schedule?season=${season}&game_type=${seasonType}`,
    { next: { revalidate: 3600 } }
  );
  const schedule = (await scheduleRes.json()) as ScheduleResponse;
  const weeks = schedule.weeks.length ? schedule.weeks : [1];
  const resolvedWeek = requestedWeek && weeks.includes(requestedWeek) ? requestedWeek : weeks[weeks.length - 1];
  const prevWeekCandidates = weeks.filter((wk) => wk < resolvedWeek);
  const prevWeek = prevWeekCandidates.length ? prevWeekCandidates[prevWeekCandidates.length - 1] : undefined;

  const currentQuery = new URLSearchParams();
  currentQuery.set("season", String(season));
  currentQuery.set("week", String(resolvedWeek));
  if (seasonType) currentQuery.set("season_type", seasonType);

  const prevQuery = new URLSearchParams();
  prevQuery.set("season", String(season));
  if (prevWeek !== undefined) prevQuery.set("week", String(prevWeek));
  if (seasonType) prevQuery.set("season_type", seasonType);

  const [currentRes, prevRes] = await Promise.all([
    fetch(`${baseUrl}/api/stats/nfl/score-week?${currentQuery.toString()}`, { next: { revalidate: 3600 } }),
    prevWeek !== undefined
      ? fetch(`${baseUrl}/api/stats/nfl/score-week?${prevQuery.toString()}`, { next: { revalidate: 3600 } })
      : Promise.resolve(null),
  ]);

  const current = (await currentRes.json()) as ScoreWeekResponse;
  const prev = prevRes ? ((await prevRes.json()) as ScoreWeekResponse) : { rows: [] };

  const prevSorted = prev.rows
    .map((row) => ({ id: row.player_id, score: scoreValue(row) }))
    .sort((a, b) => b.score - a.score);

  const prevRankById = new Map<string, number>();
  for (let i = 0; i < prevSorted.length; i += 1) {
    prevRankById.set(prevSorted[i].id, i + 1);
  }

  const prevScoreById = new Map<string, number>();
  for (const row of prev.rows) {
    prevScoreById.set(row.player_id, scoreValue(row));
  }

  const currentSorted = current.rows
    .map((row) => ({
      row,
      score: scoreValue(row),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_LIMIT);

  const breakouts: OpportunityRow[] = currentSorted
    .map(({ row, score }) => {
      const previousScore = prevScoreById.get(row.player_id) ?? 0;
      const previousRank = prevRankById.get(row.player_id);
      return {
        playerId: row.player_id,
        name: row.player_display_name,
        team: row.team,
        position: row.position,
        currentScore: score,
        previousScore,
        delta: score - previousScore,
        previousRank,
      };
    })
    .filter((row) => row.previousRank === undefined || row.previousRank > PREV_RANK_THRESHOLD)
    .sort((a, b) => b.currentScore - a.currentScore);

  return (
    <NflPageShell title="NFL opportunities" description="Breakout candidates vs prior-week ranking.">
      <section className="mt-6 flex flex-wrap gap-3">
        {SAMPLE_SEASONS.map((year) => (
          <Link
            key={year}
            className={`rounded-full border px-4 py-2 text-sm ${
              year === season
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/opportunities${buildQuery({ season: String(year), week: params.week, season_type: seasonType })}`}
          >
            {year}
          </Link>
        ))}
        {SEASON_TYPES.map((type) => (
          <Link
            key={type}
            className={`rounded-full border px-3 py-2 text-xs ${
              type === seasonType
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/opportunities${buildQuery({ season: String(season), week: params.week, season_type: type })}`}
          >
            {type}
          </Link>
        ))}
      </section>

      <section className="mt-4 flex flex-wrap gap-2">
        {weeks.map((wk) => (
          <Link
            key={wk}
            className={`rounded-full border px-3 py-1 text-xs ${
              wk === resolvedWeek
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/opportunities${buildQuery({ season: String(season), week: String(wk), season_type: seasonType })}`}
          >
            Week {wk}
          </Link>
        ))}
      </section>

      <section className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Showing players in the top {TOP_LIMIT} of week {resolvedWeek} who were outside top{" "}
          {PREV_RANK_THRESHOLD} the week before.
        </p>
      </section>

      <section className="mt-8">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Prev score</th>
                <th className="px-3 py-2">Prev rank</th>
                <th className="px-3 py-2">Δ</th>
              </tr>
            </thead>
            <tbody>
              {breakouts.map((row) => (
                <tr key={row.playerId} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 text-black dark:text-white">
                    <Link className="hover:underline" href={`/nfl/player/${row.playerId}?season=${season}&season_type=${seasonType}`}>
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.position ?? "—"}</td>
                  <td className="px-3 py-2 text-black dark:text-white">{row.currentScore.toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.previousScore.toFixed(2)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.previousRank ?? "NR"}</td>
                  <td className="px-3 py-2 text-green-600 dark:text-green-400">+{row.delta.toFixed(2)}</td>
                </tr>
              ))}
              {breakouts.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={7}>
                    No breakout candidates found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </NflPageShell>
  );
}
