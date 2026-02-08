"use client";

import { useState } from "react";

const ALERT_ADMIN_TOKEN_STORAGE_KEY = "market_alert_admin_token";

type Props = {
  mutationsAuthConfigured: boolean;
};

export default function AlertAdminTokenPanel({ mutationsAuthConfigured }: Props) {
  const [value, setValue] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return window.localStorage.getItem(ALERT_ADMIN_TOKEN_STORAGE_KEY)?.trim() ?? "";
    } catch {
      return "";
    }
  });
  const [saved, setSaved] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return Boolean(window.localStorage.getItem(ALERT_ADMIN_TOKEN_STORAGE_KEY)?.trim());
    } catch {
      return false;
    }
  });
  const [message, setMessage] = useState<string | null>(null);

  function save() {
    const next = value.trim();
    if (!next) {
      setMessage("Enter a token before saving.");
      setSaved(false);
      return;
    }
    try {
      window.localStorage.setItem(ALERT_ADMIN_TOKEN_STORAGE_KEY, next);
      setSaved(true);
      setMessage("Token saved in this browser.");
    } catch {
      setMessage("Failed to save token in browser storage.");
    }
  }

  function clear() {
    try {
      window.localStorage.removeItem(ALERT_ADMIN_TOKEN_STORAGE_KEY);
    } catch {
      // ignore
    }
    setValue("");
    setSaved(false);
    setMessage("Token cleared from this browser.");
  }

  return (
    <section className="mt-4 rounded-xl border border-black/10 bg-white/80 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">Mutation auth</span>
        <span
          className={`text-xs ${
            mutationsAuthConfigured ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
          }`}
        >
          server {mutationsAuthConfigured ? "configured" : "missing"}
        </span>
        <span className={`text-xs ${saved ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400"}`}>
          browser token {saved ? "set" : "not set"}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="password"
          placeholder="MARKET_ALERT_ADMIN_TOKEN"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="min-w-[280px] rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-black dark:border-white/10 dark:bg-black/20 dark:text-white"
        />
        <button
          type="button"
          onClick={save}
          className="rounded-md border border-black/10 px-2 py-1 text-xs text-black hover:bg-zinc-100 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
        >
          Save token
        </button>
        <button
          type="button"
          onClick={clear}
          className="rounded-md border border-black/10 px-2 py-1 text-xs text-black hover:bg-zinc-100 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
        >
          Clear token
        </button>
      </div>

      {message ? <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{message}</p> : null}
    </section>
  );
}
