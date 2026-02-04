type Props = {
  title: string;
  items: string[];
};

export default function NflPlaceholder({ title, items }: Props) {
  return (
    <section className="mt-8">
      <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
        <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Status</div>
        <div className="mt-2 text-lg font-semibold text-black dark:text-white">{title}</div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
