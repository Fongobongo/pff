"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const SEASONS = [2019, 2020, 2021, 2022, 2023, 2024];
const SEASON_TYPES = ["ALL", "REG", "POST"] as const;

export default function NflPlayerControls() {
  const router = useRouter();
  const params = useSearchParams();
  const season = params.get("season") ?? "2021";
  const seasonType = params.get("season_type") ?? "ALL";
  const week = params.get("week") ?? "";

  const weekOptions = useMemo(() => Array.from({ length: 18 }, (_, i) => i + 1), []);

  function updateQuery(next: Record<string, string | undefined>) {
    const nextParams = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value || value === "ALL") {
        nextParams.delete(key);
      } else {
        nextParams.set(key, value);
      }
    }
    router.push(`?${nextParams.toString()}`);
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <label className="text-sm text-zinc-600 dark:text-zinc-400">
        Season
        <select
          className="mt-2 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          value={season}
          onChange={(e) => updateQuery({ season: e.target.value })}
        >
          {SEASONS.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm text-zinc-600 dark:text-zinc-400">
        Season type
        <select
          className="mt-2 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          value={seasonType}
          onChange={(e) => updateQuery({ season_type: e.target.value })}
        >
          {SEASON_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm text-zinc-600 dark:text-zinc-400">
        Week
        <select
          className="mt-2 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          value={week}
          onChange={(e) => updateQuery({ week: e.target.value })}
        >
          <option value="">All</option>
          {weekOptions.map((wk) => (
            <option key={wk} value={wk}>
              {wk}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
