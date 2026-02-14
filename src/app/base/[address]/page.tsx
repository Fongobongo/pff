import Link from "next/link";
import { isAddress } from "viem";
import { shortenAddress } from "@/lib/format";
import TokenBalances from "./TokenBalances";
import FlowsTable from "./FlowsTable";
import { type TokenMetadata } from "@/lib/token";
import { getBaseUrl } from "@/lib/serverBaseUrl";

type PortfolioResponse = {
  chain: string;
  address: string;
  tokenBalances: Array<{ contractAddress: string; tokenBalance: string }>;
  tokenMetadataByAddress: Record<string, TokenMetadata>;
};

type TransfersResponse = {
  chain: string;
  address: string;
  summary: {
    transferCount: number;
    incomingCount: number;
    outgoingCount: number;
  };
  result: {
    transfers: Array<{
      blockNum?: string;
      hash?: string;
      from?: string;
      to?: string;
      value?: number;
      asset?: string;
      category?: string;
      contractAddress?: string;
      erc1155Metadata?: Array<{ tokenId?: string; value?: string }>;
      metadata?: { blockTimestamp?: string };
    }>;
  };
};

type FlowsResponse = {
  chain: string;
  address: string;
  summary: { tokenCount: number; transferCount: number };
  flows: Array<{
    asset: string;
    contractAddress?: string;
    inValue: number;
    outValue: number;
    netValue: number;
    inCount: number;
    outCount: number;
    lastTimestamp?: string;
  }>;
};

function formatTransferValue(transfer: TransfersResponse["result"]["transfers"][number]): string {
  const category = (transfer.category ?? "").toLowerCase();
  if (category === "erc1155") {
    const tokenCount = transfer.erc1155Metadata?.length ?? 0;
    return tokenCount > 0 ? `${tokenCount} tokenIds` : "ERC-1155";
  }
  if (typeof transfer.value === "number") {
    return transfer.value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }
  return "—";
}

function toErrorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return String(reason);
}

async function getJson<T>(url: string, timeoutMs = 10000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) {
      let errorMessage = `Request failed: ${res.status} ${res.statusText}`;
      try {
        const body = (await res.json()) as { message?: string };
        if (body?.message) errorMessage = `${errorMessage} (${body.message})`;
      } catch {
        // ignore body parsing errors for non-JSON responses
      }
      throw new Error(errorMessage);
    }
    return res.json();
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export default async function BaseWalletPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  if (!isAddress(address)) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-white">Base wallet</h1>
            <p className="text-sm text-gray-400">{address}</p>
          </div>
          <Link className="text-sm text-blue-400 hover:underline" href="/">
            Home
          </Link>
        </div>
        <section className="mt-6 rounded-xl border border-rose-400/40 bg-rose-500/10 p-4">
          <div className="text-sm text-rose-300">Invalid address</div>
          <p className="mt-1 text-sm text-rose-200">
            Please provide a valid EVM address in `0x…` format.
          </p>
        </section>
      </main>
    );
  }

  const base = await getBaseUrl();

  const [portfolioResult, flowsResult, transfersResult] = await Promise.allSettled([
    getJson<PortfolioResponse>(`${base}/api/base/${address}/portfolio`),
    getJson<FlowsResponse>(`${base}/api/base/${address}/flows?maxCount=0xC8`),
    getJson<TransfersResponse>(`${base}/api/base/${address}/transfers?maxCount=0x64`),
  ]);

  const portfolio = portfolioResult.status === "fulfilled" ? portfolioResult.value : null;
  const flows = flowsResult.status === "fulfilled" ? flowsResult.value : null;
  const transfers = transfersResult.status === "fulfilled" ? transfersResult.value : null;

  const portfolioError =
    portfolioResult.status === "rejected" ? toErrorMessage(portfolioResult.reason) : null;
  const flowsError = flowsResult.status === "rejected" ? toErrorMessage(flowsResult.reason) : null;
  const transfersError =
    transfersResult.status === "rejected" ? toErrorMessage(transfersResult.reason) : null;

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Base wallet</h1>
          <p className="text-sm text-gray-400">{address}</p>
        </div>
        <Link className="text-sm text-blue-400 hover:underline" href="/">
          Home
        </Link>
      </div>

      {portfolioError || flowsError || transfersError ? (
        <section className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4">
          <div className="text-sm text-amber-300">Partial data unavailable</div>
          <div className="mt-1 space-y-1 text-xs text-amber-200">
            {portfolioError ? <p>Portfolio API: {portfolioError}</p> : null}
            {flowsError ? <p>Flows API: {flowsError}</p> : null}
            {transfersError ? <p>Transfers API: {transfersError}</p> : null}
          </div>
        </section>
      ) : null}

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 md:col-span-3">
          <div className="text-sm text-gray-400">Token balances</div>
          <div className="mt-2 text-xl text-white">
            {portfolio ? portfolio.tokenBalances.length : "—"}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {portfolio
              ? "Includes token metadata (symbol/decimals) when available."
              : "Portfolio endpoint unavailable."}
          </p>
        </div>
      </section>

      {portfolio ? (
        <TokenBalances
          tokenBalances={portfolio.tokenBalances}
          tokenMetadataByAddress={portfolio.tokenMetadataByAddress}
        />
      ) : (
        <section className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-lg font-semibold text-white">Token balances</h2>
          <p className="mt-2 text-sm text-gray-400">Data unavailable.</p>
        </section>
      )}

      <FlowsTable flows={flows?.flows ?? []} unavailableMessage={flowsError ?? undefined} />

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">Recent transfers</h2>
        {transfers ? (
          <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-left text-gray-300">
                <tr>
                  <th className="p-3">Time</th>
                  <th className="p-3">Asset</th>
                  <th className="p-3">Value</th>
                  <th className="p-3">From</th>
                  <th className="p-3">To</th>
                  <th className="p-3">Tx</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {transfers.result.transfers.slice(0, 25).map((t, i) => (
                  <tr key={`${t.hash ?? ""}-${i}`} className="text-gray-200">
                    <td className="p-3 whitespace-nowrap text-gray-400">
                      {t.metadata?.blockTimestamp ?? "—"}
                    </td>
                    <td className="p-3">
                      <div>{t.asset ?? t.category ?? "—"}</div>
                      {(t.category ?? "").toLowerCase() === "erc1155" && t.contractAddress ? (
                        <div className="text-xs text-gray-500">{shortenAddress(t.contractAddress)}</div>
                      ) : null}
                    </td>
                    <td className="p-3">{formatTransferValue(t)}</td>
                    <td className="p-3">{t.from ? shortenAddress(t.from) : "—"}</td>
                    <td className="p-3">{t.to ? shortenAddress(t.to) : "—"}</td>
                    <td className="p-3">
                      {t.hash ? (
                        <a
                          className="text-blue-400 hover:underline"
                          href={`https://basescan.org/tx/${t.hash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {shortenAddress(t.hash)}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
                {transfers.result.transfers.length === 0 ? (
                  <tr>
                    <td className="p-3 text-gray-400" colSpan={6}>
                      No transfers found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-400">
            Transfers data unavailable.
          </div>
        )}
      </section>

      <section className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm text-gray-300">Next steps</div>
        <ul className="mt-2 list-disc pl-5 text-sm text-gray-400">
          <li>Enrich token balances with symbol/decimals and formatted amounts.</li>
          <li>Compute in-game portfolio (Sport.fun) from protocol contracts (shares, trades, prices).</li>
          <li>Add football + NFL athlete stats pages with historical scoring.</li>
        </ul>
      </section>
    </main>
  );
}
