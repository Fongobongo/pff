import Link from "next/link";
import { getBaseUrl } from "@/lib/serverBaseUrl";
import NflPageShell from "../_components/NflPageShell";
import JobStatusPanel from "../_components/JobStatusPanel";
import MatrixTable from "../_components/MatrixTable";

const SAMPLE_SEASONS = [2021, 2022, 2023];
const SEASON_TYPES = ["REG", "POST", "PRE"] as const;

type ScheduleResponse = {
  weeks: number[];
};

type MatrixResponse = {
  status?: string;
  jobId?: string;
  gamesTotal?: number;
  gamesProcessed?: number;
  season?: number;
  seasonType?: string | null;
  sort?: string;
  dir?: string;
  rows?: Array<{
    playerId: string;
    playerName: string;
    team?: string;
    position?: string;
    games: number;
    totalRounded: number;
    average: number;
    weekScores: Array<number | null>;
  }>;
  weeks?: number[];
  weekStart?: number;
  weekEnd?: number;
};

function buildQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

function buildPresets(minWeek: number, maxWeek: number) {
  const presets = [
    { label: `Weeks ${minWeek}-${Math.min(maxWeek, minWeek + 3)}`, start: minWeek, end: Math.min(maxWeek, minWeek + 3) },
    { label: `Weeks ${minWeek}-${Math.min(maxWeek, minWeek + 7)}`, start: minWeek, end: Math.min(maxWeek, minWeek + 7) },
    { label: `Weeks ${minWeek}-${maxWeek}`, start: minWeek, end: maxWeek },
  ];
  const seen = new Set<string>();
  return presets.filter((preset) => {
    const key = `${preset.start}-${preset.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default async function NflTournamentMatrixPage({
  searchParams,
}: {
  searchParams: Promise<{
    season?: string;
    season_type?: string;
    week_start?: string;
    week_end?: string;
    top?: string;
    sort?: string;
    dir?: string;
    mode?: string;
    weeks_window?: string;
    weeks_offset?: string;
    filter?: string;
  }>;
}) {
  const params = await searchParams;
  const rawSeason = Number(params.season ?? "2023");
  const season = Number.isFinite(rawSeason) ? rawSeason : 2023;
  const seasonType = (params.season_type ?? "REG").toUpperCase();
  const top = Math.min(200, Math.max(1, Number(params.top ?? "25") || 25));
  const rawWeekStart = params.week_start ? Number(params.week_start) : undefined;
  const rawWeekEnd = params.week_end ? Number(params.week_end) : undefined;
  const weekStart = rawWeekStart !== undefined && Number.isFinite(rawWeekStart) ? rawWeekStart : undefined;
  const weekEnd = rawWeekEnd !== undefined && Number.isFinite(rawWeekEnd) ? rawWeekEnd : undefined;
  const sort = params.sort ?? "total";
  const dir = params.dir === "asc" ? "asc" : "desc";
  const rawWindowSize = params.weeks_window ? Number(params.weeks_window) : undefined;
  const rawOffset = params.weeks_offset ? Number(params.weeks_offset) : undefined;
  const initialWindowSize = rawWindowSize !== undefined && Number.isFinite(rawWindowSize) ? rawWindowSize : undefined;
  const initialOffset = rawOffset !== undefined && Number.isFinite(rawOffset) ? rawOffset : undefined;
  const windowParam = params.weeks_window;
  const offsetParam = params.weeks_offset;
  const filterParam = params.filter ?? undefined;

  const baseUrl = await getBaseUrl();
  const scheduleRes = await fetch(
    `${baseUrl}/api/stats/nfl/schedule?season=${season}&game_type=${seasonType}`,
    { next: { revalidate: 3600 } }
  );
  const schedule = (await scheduleRes.json()) as ScheduleResponse;
  const weeks = schedule.weeks.length ? schedule.weeks : [1];
  const minWeek = weeks[0] ?? 1;
  const maxWeek = weeks[weeks.length - 1] ?? minWeek;
  const presets = buildPresets(minWeek, maxWeek);

  const query = new URLSearchParams();
  query.set("season", String(season));
  query.set("season_type", seasonType);
  if (weekStart !== undefined) query.set("week_start", String(weekStart));
  if (weekEnd !== undefined) query.set("week_end", String(weekEnd));
  query.set("top", String(top));
  if (sort) query.set("sort", sort);
  if (dir) query.set("dir", dir);
  if (params.mode) query.set("mode", params.mode);

  const res = await fetch(`${baseUrl}/api/stats/nfl/tournament-matrix?${query.toString()}`, {
    next: { revalidate: 3600 },
  });
  const data = (await res.json()) as MatrixResponse;
  const isJob = Boolean(data.status && !data.rows);
  const csvHref = `/api/stats/nfl/tournament-matrix${buildQuery({
    season: String(season),
    season_type: seasonType,
    week_start: weekStart !== undefined ? String(weekStart) : undefined,
    week_end: weekEnd !== undefined ? String(weekEnd) : undefined,
    top: String(top),
    sort,
    dir,
    format: "csv",
    mode: params.mode,
    weeks_window: windowParam,
    weeks_offset: offsetParam,
    filter: filterParam,
  })}`;

  return (
    <NflPageShell title="NFL tournament matrix" description="Per-week scoring matrix for top players.">
      <section className="mt-6 flex flex-wrap gap-3">
        {SAMPLE_SEASONS.map((year) => (
          <Link
            key={year}
            className={`rounded-full border px-4 py-2 text-sm ${
              year === season
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-white text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            href={`/nfl/tournament-matrix${buildQuery({
              season: String(year),
              season_type: seasonType,
              week_start: weekStart !== undefined ? String(weekStart) : undefined,
              week_end: weekEnd !== undefined ? String(weekEnd) : undefined,
              top: String(top),
              weeks_window: windowParam,
              weeks_offset: offsetParam,
              filter: filterParam,
            })}`}
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
            href={`/nfl/tournament-matrix${buildQuery({
              season: String(season),
              season_type: type,
              week_start: weekStart !== undefined ? String(weekStart) : undefined,
              week_end: weekEnd !== undefined ? String(weekEnd) : undefined,
              top: String(top),
              weeks_window: windowParam,
              weeks_offset: offsetParam,
              filter: filterParam,
            })}`}
          >
            {type}
          </Link>
        ))}
      </section>

      <form className="mt-6 flex flex-wrap items-end gap-3" method="GET">
        <input type="hidden" name="season" value={String(season)} />
        <input type="hidden" name="season_type" value={seasonType} />
        <input type="hidden" name="weeks_window" defaultValue={windowParam ?? ""} />
        <input type="hidden" name="weeks_offset" defaultValue={offsetParam ?? ""} />
        <input type="hidden" name="filter" defaultValue={filterParam ?? ""} />
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Week start
          <input
            name="week_start"
            defaultValue={weekStart ?? ""}
            placeholder={String(weeks[0] ?? 1)}
            className="mt-1 block w-28 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Week end
          <input
            name="week_end"
            defaultValue={weekEnd ?? ""}
            placeholder={String(weeks[weeks.length - 1] ?? 1)}
            className="mt-1 block w-28 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Top
          <input
            name="top"
            defaultValue={top}
            className="mt-1 block w-20 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        <button
          type="submit"
          className="rounded-md border border-black/10 bg-black px-4 py-2 text-sm text-white hover:bg-zinc-800 dark:border-white/10 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Apply
        </button>
        <Link className="text-sm text-blue-500 hover:underline" href={csvHref}>
          Export CSV
        </Link>
      </form>

      <section className="mt-4 flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        <span>Presets:</span>
        {presets.map((preset) => (
          <Link
            key={`${preset.start}-${preset.end}`}
            className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            href={`/nfl/tournament-matrix${buildQuery({
              season: String(season),
              season_type: seasonType,
              week_start: String(preset.start),
              week_end: String(preset.end),
              top: String(top),
              sort,
              dir,
              weeks_window: windowParam,
              weeks_offset: offsetParam,
              filter: filterParam,
            })}`}
          >
            {preset.label}
          </Link>
        ))}
        <Link
          className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
          href={`/nfl/tournament-matrix${buildQuery({
            season: String(season),
            season_type: seasonType,
            top: String(top),
            sort,
            dir,
            mode: "async",
            weeks_window: windowParam,
            weeks_offset: offsetParam,
            filter: filterParam,
          })}`}
        >
          All (async)
        </Link>
      </section>

      {isJob ? (
        <section className="mt-8 rounded-xl border border-black/10 bg-white p-4 text-sm text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
          <JobStatusPanel
            jobId={data.jobId}
            initialStatus={data.status}
            initialProcessed={data.gamesProcessed}
            initialTotal={data.gamesTotal}
          />
          <div className="mt-2">Live status via SSE.</div>
        </section>
      ) : (
        <MatrixTable
          season={season}
          seasonType={seasonType}
          weekStart={weekStart}
          weekEnd={weekEnd}
          top={top}
          sort={sort}
          dir={dir}
          rows={data.rows ?? []}
          weeks={data.weeks ?? []}
          initialWindowSize={initialWindowSize}
          initialOffset={initialOffset}
          hasWindowParam={params.weeks_window !== undefined}
          initialFilter={filterParam}
          hasFilterParam={params.filter !== undefined}
        />
      )}
    </NflPageShell>
  );
}
