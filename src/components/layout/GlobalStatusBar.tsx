"use client";

import { useEffect, useState } from "react";

function formatTimestamp(value: Date): string {
  return value.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

export default function GlobalStatusBar() {
  const [updatedAtLabel, setUpdatedAtLabel] = useState("—");

  useEffect(() => {
    const refresh = () => setUpdatedAtLabel(formatTimestamp(new Date()));
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="sticky top-0 z-[110] border-b border-black/10 bg-white/85 backdrop-blur dark:border-white/10 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-10 max-w-7xl items-center justify-between px-4">
        <span className="text-xs text-zinc-600 dark:text-zinc-400">Data updated: {updatedAtLabel}</span>
        <span className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-500">sports.fun analytics</span>
      </div>
    </header>
  );
}
