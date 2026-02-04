"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";

type MatrixRow = {
  playerId: string;
  playerName: string;
  team?: string;
  position?: string;
  games: number;
  totalRounded: number;
  average: number;
  weekScores: Array<number | null>;
};

type Props = {
  season: number;
  seasonType: string;
  weekStart?: number;
  weekEnd?: number;
  top: number;
  sort: string;
  dir: "asc" | "desc";
  rows: MatrixRow[];
  weeks: number[];
  initialWindowSize?: number;
  initialOffset?: number;
  hasWindowParam?: boolean;
  initialFilter?: string;
  hasFilterParam?: boolean;
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function MatrixTable({
  season,
  seasonType,
  weekStart,
  weekEnd,
  top,
  sort,
  dir,
  rows,
  weeks,
  initialWindowSize,
  initialOffset,
  hasWindowParam,
  initialFilter,
  hasFilterParam,
}: Props) {
  const fallbackWindow = Math.min(8, Math.max(1, weeks.length || 1));
  const storageKey = `nfl_matrix_window_${season}_${seasonType}`;
  const filterStorageKey = `nfl_matrix_filter_${season}_${seasonType}`;
  const storedWindowValue = useSyncExternalStore(
    (callback) => {
      if (typeof window === "undefined") return () => {};
      const handler = (event: StorageEvent) => {
        if (event.key === storageKey) callback();
      };
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    },
    () => {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(storageKey);
    },
    () => null
  );
  const parsedStored = storedWindowValue ? Number(storedWindowValue) : NaN;
  const storedWindow = Number.isFinite(parsedStored) ? parsedStored : undefined;
  const storedFilterValue = useSyncExternalStore(
    (callback) => {
      if (typeof window === "undefined") return () => {};
      const handler = (event: StorageEvent) => {
        if (event.key === filterStorageKey) callback();
      };
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    },
    () => {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(filterStorageKey);
    },
    () => null
  );
  const storedFilter = storedFilterValue ?? "";
  const baseWindow = clamp(
    hasWindowParam && Number.isFinite(initialWindowSize) ? (initialWindowSize as number) : storedWindow ?? fallbackWindow,
    1,
    weeks.length || 1
  );
  const [windowOverride, setWindowOverride] = useState<number | null>(null);
  const windowSize = windowOverride ?? baseWindow;
  const [startIndex, setStartIndex] = useState(Number.isFinite(initialOffset) ? (initialOffset as number) : 0);
  const baseFilter = hasFilterParam && initialFilter !== undefined ? initialFilter : storedFilter;
  const [filterOverride, setFilterOverride] = useState<string | null>(null);
  const filter = filterOverride ?? baseFilter;

  const maxStart = Math.max(0, weeks.length - windowSize);
  const safeStart = clamp(startIndex, 0, maxStart);
  const endIndex = Math.min(weeks.length, safeStart + windowSize);

  const visibleWeeks = useMemo(() => weeks.slice(safeStart, endIndex), [weeks, safeStart, endIndex]);
  const filterTrimmed = filter.trim();
  const filterValue = filterTrimmed.toLowerCase();
  const filteredRows = useMemo(() => {
    if (!filterValue) return rows;
    return rows.filter((row) => {
      const name = row.playerName.toLowerCase();
      const team = (row.team ?? "").toLowerCase();
      const position = (row.position ?? "").toLowerCase();
      return name.includes(filterValue) || team.includes(filterValue) || position.includes(filterValue);
    });
  }, [rows, filterValue]);

  const handleWindowSizeChange = (value: number) => {
    const nextSize = clamp(value, 1, weeks.length || 1);
    setWindowOverride(nextSize);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, String(nextSize));
    }
    setStartIndex((current) => clamp(current, 0, Math.max(0, weeks.length - nextSize)));
  };

  const shift = (delta: number) => {
    setStartIndex((current) => clamp(current + delta, 0, Math.max(0, weeks.length - windowSize)));
  };

  const rangeLabel = weeks.length
    ? `Weeks ${weeks[safeStart] ?? "?"}-${weeks[endIndex - 1] ?? "?"} of ${weeks.length}`
    : "No weeks";

  const windowParam = String(windowSize);
  const offsetParam = safeStart > 0 ? String(safeStart) : undefined;
  const filterParam = filterTrimmed || undefined;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("weeks_window", windowParam);
    if (offsetParam) {
      url.searchParams.set("weeks_offset", offsetParam);
    } else {
      url.searchParams.delete("weeks_offset");
    }
    if (filterParam) {
      url.searchParams.set("filter", filterParam);
    } else {
      url.searchParams.delete("filter");
    }
    if (url.toString() !== window.location.href) {
      window.history.replaceState({}, "", url.toString());
    }
  }, [windowParam, offsetParam, filterParam]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasWindowParam || !Number.isFinite(initialWindowSize)) return;
    const normalized = clamp(initialWindowSize as number, 1, weeks.length || 1);
    window.localStorage.setItem(storageKey, String(normalized));
  }, [hasWindowParam, initialWindowSize, weeks.length, storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasFilterParam || initialFilter === undefined) return;
    window.localStorage.setItem(filterStorageKey, initialFilter);
  }, [hasFilterParam, initialFilter, filterStorageKey]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const updateInput = (name: string, value?: string) => {
      const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
      if (input) input.value = value ?? "";
    };
    updateInput("weeks_window", windowParam);
    updateInput("weeks_offset", offsetParam);
    updateInput("filter", filterParam);
  }, [windowParam, offsetParam, filterParam]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storageKey = `nfl_matrix_window_${season}_${seasonType}`;
    window.localStorage.setItem(storageKey, String(windowSize));
  }, [windowSize, season, seasonType]);

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        <span>{rangeLabel}</span>
        <label className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-black dark:border-white/10 dark:bg-white/5 dark:text-white">
          Filter
          <input
            value={filter}
            onChange={(event) => {
              const value = event.target.value;
              setFilterOverride(value);
              if (typeof window !== "undefined") {
                window.localStorage.setItem(filterStorageKey, value);
              }
            }}
            placeholder="Player / team / position"
            className="w-40 bg-transparent text-xs text-black placeholder:text-zinc-400 focus:outline-none dark:text-white"
          />
          {filterValue ? (
            <button
              type="button"
              className="text-xs text-zinc-500 hover:underline"
              onClick={() => {
                setFilterOverride("");
                if (typeof window !== "undefined") {
                  window.localStorage.setItem(filterStorageKey, "");
                }
              }}
            >
              Clear
            </button>
          ) : null}
        </label>
        {filterValue ? (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Matches {filteredRows.length} / {rows.length}
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-full border border-black/10 px-3 py-1 text-xs text-black disabled:opacity-50 dark:border-white/10 dark:text-white"
            onClick={() => shift(-windowSize)}
            disabled={safeStart === 0}
          >
            Prev
          </button>
          <button
            type="button"
            className="rounded-full border border-black/10 px-3 py-1 text-xs text-black disabled:opacity-50 dark:border-white/10 dark:text-white"
            onClick={() => shift(windowSize)}
            disabled={safeStart >= maxStart}
          >
            Next
          </button>
          <label className="text-xs text-zinc-600 dark:text-zinc-400">
            Columns
            <select
              className="ml-2 rounded-full border border-black/10 bg-white px-2 py-1 text-xs text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
              value={windowSize}
              onChange={(event) => handleWindowSizeChange(Number(event.target.value))}
            >
              {[4, 6, 8, 10, 12, weeks.length].filter((value, index, arr) => value > 0 && arr.indexOf(value) === index).map((value) => (
                <option key={value} value={value}>
                  {value === weeks.length ? "All" : value}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
        <table className="min-w-[900px] w-full text-left text-sm">
          <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">
                <Link
                  className="hover:underline"
                  href={`/nfl/tournament-matrix${buildQuery({
                    season: String(season),
                    season_type: seasonType,
                    week_start: weekStart !== undefined ? String(weekStart) : undefined,
                    week_end: weekEnd !== undefined ? String(weekEnd) : undefined,
                    top: String(top),
                    sort: "player",
                    dir: sort === "player" && dir === "desc" ? "asc" : "desc",
                    weeks_window: windowParam,
                    weeks_offset: offsetParam,
                    filter: filterParam,
                  })}`}
                >
                  Player {sort === "player" ? (dir === "asc" ? "↑" : "↓") : ""}
                </Link>
              </th>
              <th className="px-3 py-2">
                <Link
                  className="hover:underline"
                  href={`/nfl/tournament-matrix${buildQuery({
                    season: String(season),
                    season_type: seasonType,
                    week_start: weekStart !== undefined ? String(weekStart) : undefined,
                    week_end: weekEnd !== undefined ? String(weekEnd) : undefined,
                    top: String(top),
                    sort: "team",
                    dir: sort === "team" && dir === "desc" ? "asc" : "desc",
                    weeks_window: windowParam,
                    weeks_offset: offsetParam,
                    filter: filterParam,
                  })}`}
                >
                  Team {sort === "team" ? (dir === "asc" ? "↑" : "↓") : ""}
                </Link>
              </th>
              <th className="px-3 py-2">
                <Link
                  className="hover:underline"
                  href={`/nfl/tournament-matrix${buildQuery({
                    season: String(season),
                    season_type: seasonType,
                    week_start: weekStart !== undefined ? String(weekStart) : undefined,
                    week_end: weekEnd !== undefined ? String(weekEnd) : undefined,
                    top: String(top),
                    sort: "position",
                    dir: sort === "position" && dir === "desc" ? "asc" : "desc",
                    weeks_window: windowParam,
                    weeks_offset: offsetParam,
                    filter: filterParam,
                  })}`}
                >
                  Pos {sort === "position" ? (dir === "asc" ? "↑" : "↓") : ""}
                </Link>
              </th>
              <th className="px-3 py-2">
                <Link
                  className="hover:underline"
                  href={`/nfl/tournament-matrix${buildQuery({
                    season: String(season),
                    season_type: seasonType,
                    week_start: weekStart !== undefined ? String(weekStart) : undefined,
                    week_end: weekEnd !== undefined ? String(weekEnd) : undefined,
                    top: String(top),
                    sort: "total",
                    dir: sort === "total" && dir === "desc" ? "asc" : "desc",
                    weeks_window: windowParam,
                    weeks_offset: offsetParam,
                    filter: filterParam,
                  })}`}
                >
                  Total {sort === "total" ? (dir === "asc" ? "↑" : "↓") : ""}
                </Link>
              </th>
              <th className="px-3 py-2">
                <Link
                  className="hover:underline"
                  href={`/nfl/tournament-matrix${buildQuery({
                    season: String(season),
                    season_type: seasonType,
                    week_start: weekStart !== undefined ? String(weekStart) : undefined,
                    week_end: weekEnd !== undefined ? String(weekEnd) : undefined,
                    top: String(top),
                    sort: "avg",
                    dir: sort === "avg" && dir === "desc" ? "asc" : "desc",
                    weeks_window: windowParam,
                    weeks_offset: offsetParam,
                    filter: filterParam,
                  })}`}
                >
                  Avg {sort === "avg" ? (dir === "asc" ? "↑" : "↓") : ""}
                </Link>
              </th>
              {visibleWeeks.map((week) => (
                <th key={week} className="px-3 py-2">
                  <Link
                    className="hover:underline"
                    href={`/nfl/tournament-matrix${buildQuery({
                      season: String(season),
                      season_type: seasonType,
                      week_start: weekStart !== undefined ? String(weekStart) : undefined,
                      week_end: weekEnd !== undefined ? String(weekEnd) : undefined,
                      top: String(top),
                      sort: `week_${week}`,
                      dir: sort === `week_${week}` && dir === "desc" ? "asc" : "desc",
                      weeks_window: windowParam,
                      weeks_offset: offsetParam,
                      filter: filterParam,
                    })}`}
                  >
                    W{week} {sort === `week_${week}` ? (dir === "asc" ? "↑" : "↓") : ""}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.playerId} className="border-t border-black/10 dark:border-white/10">
                <td className="px-3 py-2 text-black dark:text-white">
                  <Link className="hover:underline" href={`/nfl/player/${row.playerId}?season=${season}&season_type=${seasonType}`}>
                    {row.playerName}
                  </Link>
                </td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.team ?? "—"}</td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.position ?? "—"}</td>
                <td className="px-3 py-2 text-black dark:text-white">{row.totalRounded.toFixed(2)}</td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{row.average.toFixed(2)}</td>
                {row.weekScores.slice(safeStart, endIndex).map((score, idx) => (
                  <td key={`${row.playerId}-${safeStart + idx}`} className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {score === null ? "—" : score.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
            {filteredRows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={visibleWeeks.length + 5}>
                  {filterValue ? "No players match this filter." : "No players for this range."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
