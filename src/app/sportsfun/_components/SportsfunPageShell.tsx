import type { ReactNode } from "react";
import SportsfunNav from "./SportsfunNav";

type Props = {
  title: string;
  description?: string;
  actions?: ReactNode;
  searchQuery?: string;
  children: ReactNode;
};

export default function SportsfunPageShell({ title, description, actions, searchQuery, children }: Props) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-7xl p-6">
        <header className="mt-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">{title}</h1>
            {description ? <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{description}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <form action="/sportsfun/search" method="get" className="flex items-center gap-2">
              <input
                type="search"
                name="q"
                defaultValue={searchQuery ?? ""}
                placeholder="Search token / wallet"
                className="w-52 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs text-black placeholder:text-zinc-400 focus:border-black/30 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-zinc-500 dark:focus:border-white/30"
              />
              <button
                type="submit"
                className="rounded-full border border-black/15 bg-white px-3 py-1.5 text-xs text-black hover:bg-zinc-100 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              >
                Search
              </button>
            </form>
            {actions}
          </div>
        </header>

        <section className="mt-6">
          <SportsfunNav />
        </section>

        {children}
      </main>
    </div>
  );
}
