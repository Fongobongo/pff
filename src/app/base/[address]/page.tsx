import Link from "next/link";
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
  result: {
    transfers: Array<{
      blockNum?: string;
      hash?: string;
      from?: string;
      to?: string;
      value?: number;
      asset?: string;
      category?: string;
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

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  return res.json();
}

export default async function BaseWalletPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const base = await getBaseUrl();

  const [portfolio, flows, transfers] = await Promise.all([
    getJson<PortfolioResponse>(`${base}/api/base/${address}/portfolio`),
    getJson<FlowsResponse>(`${base}/api/base/${address}/flows?maxCount=0xC8`),
    getJson<TransfersResponse>(`${base}/api/base/${address}/transfers?maxCount=0x64`),
  ]);

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

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 md:col-span-3">
          <div className="text-sm text-gray-400">Token balances</div>
          <div className="mt-2 text-xl text-white">{portfolio.tokenBalances.length}</div>
          <p className="mt-1 text-xs text-gray-500">
            Includes token metadata (symbol/decimals) when available.
          </p>
        </div>
      </section>

      <TokenBalances
        tokenBalances={portfolio.tokenBalances}
        tokenMetadataByAddress={portfolio.tokenMetadataByAddress}
      />

      <FlowsTable flows={flows.flows} />

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">Recent transfers</h2>
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
                  <td className="p-3">{t.asset ?? t.category ?? "—"}</td>
                  <td className="p-3">{t.value ?? "—"}</td>
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
            </tbody>
          </table>
        </div>
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
