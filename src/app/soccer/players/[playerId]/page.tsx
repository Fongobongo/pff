import Link from "next/link";
import { z } from "zod";
import SoccerPageShell from "../../_components/SoccerPageShell";
import { getSportfunMarketSnapshot, toUsdNumber } from "@/lib/sportfunMarket";
import {
  fetchSoccerDirectoryPlayers,
  getSoccerPlayerDisplayName,
  normalizeSoccerPlayerName,
} from "@/lib/soccerPlayerDirectory";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  playerId: z.string().min(1),
});

function formatUsd(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1000) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (abs >= 1) return `$${value.toFixed(2)}`;
  if (abs >= 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(6)}`;
}

function formatPercent(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatNumber(value: number | undefined, maxFractionDigits = 2): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits });
}

function formatDateTime(value: string | undefined): string {
  if (!value) return "—";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

function formatShares(raw: string | undefined, fractionDigits = 2): string {
  if (!raw) return "0";
  const neg = raw.startsWith("-");
  const abs = BigInt(neg ? raw.slice(1) : raw);
  const base = 10n ** 18n;
  const whole = abs / base;
  const fraction = abs % base;
  if (fractionDigits <= 0) return `${neg ? "-" : ""}${whole.toString()}`;
  const frac = fraction.toString().padStart(18, "0").slice(0, fractionDigits);
  return `${neg ? "-" : ""}${whole.toString()}.${frac}`;
}

export default async function SoccerPlayerDetailsPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = paramsSchema.parse(await params);

  const [players, snapshot] = await Promise.all([
    fetchSoccerDirectoryPlayers(),
    getSportfunMarketSnapshot({
      sport: "soccer",
      windowHours: 24,
      trendDays: 30,
      maxTokens: 500,
    }),
  ]);

  const player = players.find((item) => item.id === playerId);
  const playerNameKey = player ? normalizeSoccerPlayerName(getSoccerPlayerDisplayName(player)) : "";
  const tokenByName = playerNameKey
    ? snapshot.tokens.find((item) => normalizeSoccerPlayerName(item.name ?? "") === playerNameKey)
    : undefined;
  const tokenById = snapshot.tokens.find((item) => item.tokenIdDec === playerId);
  const token = tokenByName ?? tokenById;

  const displayName = player ? getSoccerPlayerDisplayName(player) : token?.name ?? playerId;
  const priceUsd = player?.priceUsd ?? (token?.currentPriceUsdcRaw ? toUsdNumber(token.currentPriceUsdcRaw) : undefined);
  const change24h = player?.priceChange24h ?? player?.priceUsd24hChange ?? token?.priceChange24hPercent;
  const upcomingFixtures = player?.upcomingFixtures ?? [];
  const hasData = Boolean(player || token);

  return (
    <SoccerPageShell title={displayName} description="Soccer player overview and market details.">
      <section className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
          href="/soccer/players"
        >
          Back to players
        </Link>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">ID: {playerId}</div>
      </section>

      {!hasData ? (
        <section className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Player data not found for this ID. Try opening from the players list so the route uses a known UUID.
        </section>
      ) : null}

      <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Price</div>
          <div className="mt-2 text-xl font-semibold text-black dark:text-white">{formatUsd(priceUsd)}</div>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">24h</div>
          <div className={`mt-2 text-xl font-semibold ${((change24h ?? 0) >= 0) ? "text-emerald-500" : "text-rose-500"}`}>
            {formatPercent(change24h)}
          </div>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Market cap</div>
          <div className="mt-2 text-xl font-semibold text-black dark:text-white">{formatUsd(player?.marketCapUsd)}</div>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Total rewards</div>
          <div className="mt-2 text-xl font-semibold text-black dark:text-white">{formatUsd(player?.totalRewards)}</div>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Buy availability</div>
          <div className="mt-2 text-xl font-semibold text-black dark:text-white">
            {formatNumber(player?.buyAvailability, 3)}
          </div>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Sell availability</div>
          <div className="mt-2 text-xl font-semibold text-black dark:text-white">
            {formatNumber(player?.sellAvailability, 0)}
          </div>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <h2 className="border-b border-black/10 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Player details
          </h2>
          <dl className="grid grid-cols-1 gap-3 p-4 text-sm md:grid-cols-2">
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Team</dt>
              <dd className="text-black dark:text-white">{player?.team ?? token?.team ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Position</dt>
              <dd className="text-black dark:text-white">{player?.position ?? token?.position ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Age</dt>
              <dd className="text-black dark:text-white">{player?.age ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Appearances</dt>
              <dd className="text-black dark:text-white">{player?.appearances ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Active shares</dt>
              <dd className="text-black dark:text-white">{formatNumber(player?.globalShares?.active, 2)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Circulating shares</dt>
              <dd className="text-black dark:text-white">{formatNumber(player?.globalShares?.circulating, 2)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Rewards per game</dt>
              <dd className="text-black dark:text-white">{formatUsd(player?.rewardsPerGame)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Rewards / market cap</dt>
              <dd className="text-black dark:text-white">{formatNumber(player?.rewardsToMarketCapRatio, 2)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <h2 className="border-b border-black/10 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Market snapshot
          </h2>
          <dl className="grid grid-cols-1 gap-3 p-4 text-sm md:grid-cols-2">
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Token ID</dt>
              <dd className="text-black dark:text-white">{token?.tokenIdDec ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Metadata source</dt>
              <dd className="text-black dark:text-white">{token?.metadataSource ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">24h trades</dt>
              <dd className="text-black dark:text-white">{token?.trades24h ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">24h volume (shares)</dt>
              <dd className="text-black dark:text-white">{formatShares(token?.volume24hSharesRaw, 2)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Last trade</dt>
              <dd className="text-black dark:text-white">{formatDateTime(token?.lastTradeAt)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Price timestamp</dt>
              <dd className="text-black dark:text-white">{formatDateTime(player?.priceLastUpdated)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">Upcoming fixtures</h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Date (UTC)</th>
                <th className="px-3 py-2">Fixture</th>
                <th className="px-3 py-2">Competition</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {upcomingFixtures.map((fixture) => {
                const home = fixture.homeTeam?.acronym ?? fixture.homeTeam?.name ?? "Home";
                const away = fixture.awayTeam?.acronym ?? fixture.awayTeam?.name ?? "Away";
                const competition = fixture.competition?.shortName ?? fixture.competition?.name ?? "—";
                return (
                  <tr key={fixture.id ?? `${fixture.date ?? ""}:${home}:${away}`} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatDateTime(fixture.date)}</td>
                    <td className="px-3 py-2 text-black dark:text-white">{home} vs {away}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{competition}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{fixture.status ?? "—"}</td>
                  </tr>
                );
              })}
              {upcomingFixtures.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-600 dark:text-zinc-400" colSpan={4}>
                    No upcoming fixtures found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </SoccerPageShell>
  );
}

