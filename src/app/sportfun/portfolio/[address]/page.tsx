import Link from "next/link";
import { z } from "zod";
import { shortenAddress } from "@/lib/format";

const paramsSchema = z.object({
  address: z.string().min(1),
});

type SportfunPortfolioResponse = {
  chain: string;
  protocol: string;
  address: string;
  query?: {
    maxPages?: number;
    maxCount?: string;
    maxActivity?: number;
    includeTrades?: boolean;
    includePrices?: boolean;
    includeReceipts?: boolean;
    includeUri?: boolean;
  };
  summary: {
    erc1155TransferCount: number;
    sportfunErc1155TransferCount: number;
    contractCount: number;
    holdingCount: number;
    activityCount: number;
    decodedTradeCount?: number;
    decodedPromotionCount?: number;
    shareDeltaMismatchCount?: number;
    shareDeltaMismatchTxCount?: number;
    activityCountTotal?: number;
    activityCountReturned?: number;
    activityTruncated?: boolean;
  };
  assumptions: {
    shareUnits: string;
    knownContracts: string[];
    usdc: {
      contractAddress: string;
      decimals: number;
      note: string;
    };
  };
  analytics?: {
    realizedPnlUsdcRaw: string;
    unrealizedPnlUsdcRaw: string;
    totalCostBasisUsdcRaw: string;
    currentValueUsdcRaw: string;
    currentValueAllHoldingsUsdcRaw?: string;
    holdingsPricedCount?: number;
    costBasisUnknownTradeCount: number;
    note: string;
  };
  holdings: Array<{
    contractAddress: string;
    tokenIdHex: string;
    tokenIdDec: string;
    balanceRaw: string;
    uri?: string;
    uriError?: string;
    priceUsdcPerShareRaw?: string;
    valueUsdcRaw?: string;
  }>;
  activity: Array<{
    hash: string;
    timestamp?: string;
    kind?: "buy" | "sell" | "unknown";
    usdcDeltaRaw: string;
    erc1155Changes: Array<{
      contractAddress: string;
      tokenIdHex: string;
      tokenIdDec: string;
      deltaRaw: string;
    }>;
    inferred?: {
      kind: "buy" | "sell" | "unknown";
      contractAddress?: string;
      tokenIdDec?: string;
      shareDeltaRaw?: string;
      priceUsdcPerShareRaw?: string;
    };
    decoded?: {
      trades: Array<{
        kind: "buy" | "sell";
        playerToken?: string;
        tokenIdDec: string;
        shareAmountRaw: string;
        currencyRaw: string;
        feeRaw: string;
        walletShareDeltaRaw: string;
        walletCurrencyDeltaRaw: string;
        priceUsdcPerShareRaw?: string;
        priceUsdcPerShareIncFeeRaw?: string;
      }>;
      promotions: Array<{
        kind: "promotion";
        playerToken?: string;
        tokenIdDec: string;
        shareAmountRaw: string;
        walletShareDeltaRaw: string;
      }>;
    };
  }>;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  return res.json();
}

function formatFixed(raw: string, decimals: number): string {
  if (!raw) return "0";
  const neg = raw.startsWith("-");
  const abs = BigInt(neg ? raw.slice(1) : raw);
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}${fracStr ? "." + fracStr : ""}`;
}

function formatShares(raw: string): string {
  // Sport.fun shares appear to be 18-dec fixed.
  return formatFixed(raw, 18);
}

export default async function SportfunPortfolioPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = paramsSchema.parse(await params);

  const data = await getJson<SportfunPortfolioResponse>(
    `/api/sportfun/portfolio/${address}?maxPages=3&maxCount=0x3e8&maxActivity=500&includeTrades=1&includePrices=1&includeUri=0`
  );

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Sport.fun portfolio (WIP)</h1>
          <p className="text-sm text-gray-400">{address}</p>
        </div>
        <div className="flex items-center gap-4">
          <Link className="text-sm text-blue-400 hover:underline" href={`/base/${address}`}>
            Base wallet
          </Link>
          <Link className="text-sm text-blue-400 hover:underline" href="/">
            Home
          </Link>
        </div>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Holdings</div>
          <div className="mt-2 text-xl text-white">{data.summary.holdingCount}</div>
          <p className="mt-1 text-xs text-gray-500">Non-zero balances only.</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">ERC-1155 transfers (filtered)</div>
          <div className="mt-2 text-xl text-white">{data.summary.sportfunErc1155TransferCount}</div>
          <p className="mt-1 text-xs text-gray-500">Known Sport.fun contracts.</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Tx activity</div>
          <div className="mt-2 text-xl text-white">{data.summary.activityCount}</div>
          <p className="mt-1 text-xs text-gray-500">
            Showing {data.summary.activityCountReturned ?? data.activity.length}
            {data.summary.activityTruncated ? "/" + (data.summary.activityCountTotal ?? data.summary.activityCount) : ""}.
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Decoded trades</div>
          <div className="mt-2 text-xl text-white">{data.summary.decodedTradeCount ?? 0}</div>
          <p className="mt-1 text-xs text-gray-500">
            FDFPairV2 events
            {data.summary.decodedPromotionCount !== undefined ? ` · promotions ${data.summary.decodedPromotionCount}` : ""}
            {data.summary.shareDeltaMismatchTxCount ? ` · mismatches ${data.summary.shareDeltaMismatchTxCount} tx` : ""}.
          </p>
        </div>
      </section>

      {data.analytics ? (
        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm text-gray-400">Current value</div>
            <div className="mt-2 text-xl text-white">
              {formatFixed(
                data.analytics.currentValueAllHoldingsUsdcRaw ?? data.analytics.currentValueUsdcRaw,
                data.assumptions.usdc.decimals
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              USDC{data.analytics.holdingsPricedCount !== undefined ? ` · priced ${data.analytics.holdingsPricedCount}/${data.holdings.length}` : ""}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm text-gray-400">Cost basis</div>
            <div className="mt-2 text-xl text-white">
              {formatFixed(data.analytics.totalCostBasisUsdcRaw, data.assumptions.usdc.decimals)}
            </div>
            <p className="mt-1 text-xs text-gray-500">USDC</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm text-gray-400">Unrealized PnL</div>
            <div
              className={
                BigInt(data.analytics.unrealizedPnlUsdcRaw) >= 0n ? "mt-2 text-xl text-green-400" : "mt-2 text-xl text-red-400"
              }
            >
              {formatFixed(data.analytics.unrealizedPnlUsdcRaw, data.assumptions.usdc.decimals)}
            </div>
            <p className="mt-1 text-xs text-gray-500">USDC</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm text-gray-400">Realized PnL</div>
            <div
              className={
                BigInt(data.analytics.realizedPnlUsdcRaw) >= 0n ? "mt-2 text-xl text-green-400" : "mt-2 text-xl text-red-400"
              }
            >
              {formatFixed(data.analytics.realizedPnlUsdcRaw, data.assumptions.usdc.decimals)}
            </div>
            <p className="mt-1 text-xs text-gray-500">USDC</p>
          </div>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">Holdings</h2>
        <p className="mt-1 text-sm text-gray-400">{data.assumptions.shareUnits}</p>

        <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-gray-300">
              <tr>
                <th className="p-3">Contract</th>
                <th className="p-3">TokenId</th>
                <th className="p-3">Shares</th>
                <th className="p-3">Price (USDC/share)</th>
                <th className="p-3">Value (USDC)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {data.holdings.map((h) => (
                <tr key={`${h.contractAddress}:${h.tokenIdHex}`} className="text-gray-200">
                  <td className="p-3 whitespace-nowrap">
                    <a
                      className="text-blue-400 hover:underline"
                      href={`https://basescan.org/address/${h.contractAddress}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {shortenAddress(h.contractAddress)}
                    </a>
                  </td>
                  <td className="p-3 whitespace-nowrap">{h.tokenIdDec}</td>
                  <td className="p-3 whitespace-nowrap text-gray-200">{formatShares(h.balanceRaw)}</td>
                  <td className="p-3 whitespace-nowrap text-gray-200">
                    {h.priceUsdcPerShareRaw ? formatFixed(h.priceUsdcPerShareRaw, data.assumptions.usdc.decimals) : "—"}
                  </td>
                  <td className="p-3 whitespace-nowrap text-gray-200">
                    {h.valueUsdcRaw ? formatFixed(h.valueUsdcRaw, data.assumptions.usdc.decimals) : "—"}
                  </td>
                </tr>
              ))}
              {data.holdings.length === 0 ? (
                <tr>
                  <td className="p-3 text-gray-400" colSpan={5}>
                    No holdings found (with current contract filter).
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">Activity (tx grouped)</h2>
        <p className="mt-1 text-xs text-gray-500">Showing latest {Math.min(80, data.activity.length)} rows.</p>
        <p className="mt-1 text-sm text-gray-400">{data.assumptions.usdc.note}</p>

        <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-gray-300">
              <tr>
                <th className="p-3">Time</th>
                <th className="p-3">Kind</th>
                <th className="p-3">USDC delta</th>
                <th className="p-3">Decoded</th>
                <th className="p-3">Tx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {data.activity.slice(0, 80).map((a) => (
                <tr key={a.hash} className="text-gray-200">
                  <td className="p-3 whitespace-nowrap text-gray-400">{a.timestamp ?? "—"}</td>
                  <td className="p-3 whitespace-nowrap">
                    {a.kind && a.kind !== "unknown" ? (
                      <span className={a.kind === "buy" ? "text-green-400" : "text-red-400"}>
                        {a.kind.toUpperCase()}
                      </span>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <span className={BigInt(a.usdcDeltaRaw) >= 0n ? "text-green-400" : "text-red-400"}>
                      {formatFixed(a.usdcDeltaRaw, data.assumptions.usdc.decimals)}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1 text-xs">
                      {a.decoded?.trades?.slice(0, 3).map((t, idx) => (
                        <div key={idx} className="text-gray-200">
                          <span className={t.kind === "buy" ? "text-green-400" : "text-red-400"}>
                            {t.kind.toUpperCase()}
                          </span>{" "}
                          tokenId {t.tokenIdDec} · shares {formatShares(t.shareAmountRaw)} · net {formatFixed(t.currencyRaw, data.assumptions.usdc.decimals)} · fee {formatFixed(t.feeRaw, data.assumptions.usdc.decimals)}
                        </div>
                      ))}
                      {a.decoded?.promotions?.slice(0, 2).map((p, idx) => (
                        <div key={`p-${idx}`} className="text-amber-300">
                          PROMO tokenId {p.tokenIdDec} · shares {formatShares(p.shareAmountRaw)}
                        </div>
                      ))}
                      {a.decoded?.trades && a.decoded.trades.length > 3 ? (
                        <div className="text-gray-500">+{a.decoded.trades.length - 3} more trades…</div>
                      ) : null}
                    </div>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <div className="flex flex-col">
                      <a className="text-blue-400 hover:underline" href={`/sportfun/tx/${a.hash}`}>
                        Inspect
                      </a>
                      <a
                        className="text-xs text-gray-500 hover:underline"
                        href={`https://basescan.org/tx/${a.hash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Basescan
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {data.activity.length === 0 ? (
                <tr>
                  <td className="p-3 text-gray-400" colSpan={5}>
                    No activity found (with current contract filter).
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {data.analytics?.note ? (
        <section className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-300">PnL notes</div>
          <p className="mt-2 text-sm text-gray-400">{data.analytics.note}</p>
        </section>
      ) : null}
    </main>
  );
}
