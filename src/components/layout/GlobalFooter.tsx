export default function GlobalFooter() {
  return (
    <footer className="border-t border-black/10 bg-white/75 px-4 py-3 text-xs text-zinc-600 backdrop-blur dark:border-white/10 dark:bg-zinc-950/65 dark:text-zinc-400">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <span>sports.fun fan dashboard (unofficial)</span>
        <span className="text-zinc-500 dark:text-zinc-500">
          Disclaimer: informational use only, not financial advice.
        </span>
      </div>
    </footer>
  );
}

