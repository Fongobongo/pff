import SoccerNav from "./SoccerNav";

type Props = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

export default function SoccerPageShell({ title, description, children }: Props) {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto max-w-5xl p-6">
        <header className="mt-10">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">{title}</h1>
          {description ? <p className="mt-2 text-zinc-600 dark:text-zinc-400">{description}</p> : null}
        </header>

        <section className="mt-6">
          <SoccerNav />
        </section>

        {children}
      </main>
    </div>
  );
}
