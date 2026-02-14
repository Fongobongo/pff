import SportsfunPageShell from "../_components/SportsfunPageShell";
import { formatPercent, formatUsd } from "../_components/format";
import { getSportsfunTokens, getSportsfunTopGainers } from "@/lib/teneroSportsfun";

function parseWatchList(raw: string | undefined): string[] {
  if (!raw) return [];
  const list = raw
    .split(/[,\n\r\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(list)].slice(0, 20);
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

export default async function SportsfunWatchlistPage({
  searchParams,
}: {
  searchParams: Promise<{ watch?: string }>;
}) {
  const params = await searchParams;
  const watchRaw = params.watch?.trim() ?? "";
  const watchList = parseWatchList(watchRaw);

  let loadError: string | null = null;
  let gainers: Awaited<ReturnType<typeof getSportsfunTopGainers>> = [];
  let watchedTokens: Array<{ key: string; token: Awaited<ReturnType<typeof getSportsfunTokens>>["rows"][number] | null }> = [];

  try {
    const [topGainers, tokenResults] = await Promise.all([
      getSportsfunTopGainers("1d"),
      Promise.all(
        watchList.map(async (entry) => {
          const page = await getSportsfunTokens({
            search: entry,
            limit: 1,
            order: "volume_1d_usd",
            direction: "DESC",
          });
          return { key: entry, token: page.rows[0] ?? null };
        })
      ),
    ]);
    gainers = topGainers;
    watchedTokens = tokenResults;
  } catch (error: unknown) {
    loadError = describeError(error);
  }

  return (
    <SportsfunPageShell
      title="sports.fun Watchlist"
      description="Standalone watchlist and top gainers tool for sports.fun markets."
    >
      <section className="mt-6 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
        <form className="space-y-3" method="get">
          <label className="block text-sm font-medium text-black dark:text-white" htmlFor="watchlist-input">
            Watchlist (symbols or token addresses, comma-separated)
          </label>
          <textarea
            id="watchlist-input"
            name="watch"
            defaultValue={watchRaw}
            placeholder="KM10, JA17, 0x71c8b0c5148EdB0399D1EdF9BF0C8C81dEa16918:220160"
            className="min-h-24 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-white/10 dark:bg-black dark:text-white dark:placeholder:text-zinc-500"
          />
          <button
            type="submit"
            className="rounded-lg border border-black bg-black px-4 py-2 text-sm text-white hover:bg-zinc-800 dark:border-white dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Update watchlist
          </button>
        </form>
      </section>

      {loadError ? (
        <section className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          Failed to load watchlist data: {loadError}
        </section>
      ) : null}

      <section className="mt-8 overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
        <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
          Watchlist tokens ({watchedTokens.length})
        </div>
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">Input</th>
              <th className="px-3 py-2">Token</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">24h Δ</th>
              <th className="px-3 py-2 text-right">Volume 1d</th>
            </tr>
          </thead>
          <tbody>
            {watchedTokens.map(({ key, token }) => (
              <tr key={key} className="border-t border-black/10 dark:border-white/10">
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{key}</td>
                <td className="px-3 py-2">
                  {token ? (
                    <>
                      <div className="font-medium text-black dark:text-white">{token.name}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">{token.symbol}</div>
                    </>
                  ) : (
                    <span className="text-zinc-500 dark:text-zinc-400">No match</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">
                  {token ? formatUsd(token.price_usd, 6) : "—"}
                </td>
                <td
                  className={`px-3 py-2 text-right ${
                    (token?.price?.price_change_1d_pct ?? 0) >= 0
                      ? "text-emerald-600 dark:text-emerald-300"
                      : "text-rose-600 dark:text-rose-300"
                  }`}
                >
                  {token ? formatPercent(token.price?.price_change_1d_pct) : "—"}
                </td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">
                  {token ? formatUsd(token.metrics?.volume_1d_usd) : "—"}
                </td>
              </tr>
            ))}
            {watchList.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-zinc-500 dark:text-zinc-400" colSpan={5}>
                  No watchlist entries yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="mt-8 overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
        <div className="border-b border-black/10 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
          Top gainers (1d)
        </div>
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">Token</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">24h Δ</th>
              <th className="px-3 py-2 text-right">Volume 1d</th>
            </tr>
          </thead>
          <tbody>
            {gainers.slice(0, 25).map((row) => (
              <tr key={row.address} className="border-t border-black/10 dark:border-white/10">
                <td className="px-3 py-2">
                  <div className="font-medium text-black dark:text-white">{row.name}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">{row.symbol}</div>
                </td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatUsd(row.price_usd, 6)}</td>
                <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-300">
                  {formatPercent(row.price?.price_change_1d_pct)}
                </td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{formatUsd(row.metrics?.volume_1d_usd)}</td>
              </tr>
            ))}
            {gainers.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-zinc-500 dark:text-zinc-400" colSpan={4}>
                  No gainers data.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </SportsfunPageShell>
  );
}
