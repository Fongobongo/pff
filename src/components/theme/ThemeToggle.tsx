"use client";

import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

function resolvePreferredTheme(): ThemeMode {
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    return resolvePreferredTheme();
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function handleToggle() {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    window.localStorage.setItem("theme", next);
    setTheme(next);
  }

  const label = theme === "dark" ? "Light mode" : "Dark mode";
  const icon = theme === "dark" ? "Sun" : "Moon";

  return (
    <button
      type="button"
      onClick={handleToggle}
      data-testid="theme-toggle"
      aria-label={label}
      title={label}
      suppressHydrationWarning
      className="fixed right-4 top-4 z-[120] rounded-full border border-black/10 bg-white/90 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900/85 dark:text-zinc-100 dark:hover:bg-zinc-800"
    >
      {icon}
    </button>
  );
}
