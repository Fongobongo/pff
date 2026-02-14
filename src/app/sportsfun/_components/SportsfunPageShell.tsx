import type { ReactNode } from "react";
import SportsfunNav from "./SportsfunNav";

type Props = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export default function SportsfunPageShell({ title, description, actions, children }: Props) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-7xl p-6">
        <header className="mt-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">{title}</h1>
            {description ? <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>

        <section className="mt-6">
          <SportsfunNav />
        </section>

        {children}
      </main>
    </div>
  );
}
