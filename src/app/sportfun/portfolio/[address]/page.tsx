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
  summary: {
    erc1155TransferCount: number;
    sportfunErc1155TransferCount: number;
    contractCount: number;
    holdingCount: number;
  };
  assumptions: {
    shareUnits: string;
    knownContracts: string[];
  };
  holdings: Array<{
    contractAddress: string;
    tokenIdHex: string;
    tokenIdDec: string;
    balanceRaw: string;
    uri?: string;
    uriError?: string;
  }>;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  return res.json();
}

export default async function SportfunPortfolioPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = paramsSchema.parse(await params);

  const data = await getJson<SportfunPortfolioResponse>(
    `/api/sportfun/portfolio/${address}?maxPages=3&maxCount=0x3e8`
  );

  return (
    <main className="mx-auto max-w-5xl p-6">
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

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Holdings</div>
          <div className="mt-2 text-xl text-white">{data.summary.holdingCount}</div>
          <p className="mt-1 text-xs text-gray-500">Non-zero balances only.</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">ERC-1155 transfers (filtered)</div>
          <div className="mt-2 text-xl text-white">{data.summary.sportfunErc1155TransferCount}</div>
          <p className="mt-1 text-xs text-gray-500">Only known Sport.fun contracts.</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Contracts</div>
          <div className="mt-2 text-xl text-white">{data.summary.contractCount}</div>
          <p className="mt-1 text-xs text-gray-500">Observed in transfer history.</p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">Holdings (raw)</h2>
        <p className="mt-1 text-sm text-gray-400">{data.assumptions.shareUnits}</p>

        <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-gray-300">
              <tr>
                <th className="p-3">Contract</th>
                <th className="p-3">TokenId (dec)</th>
                <th className="p-3">TokenId (hex)</th>
                <th className="p-3">Balance (raw)</th>
                <th className="p-3">URI (best-effort)</th>
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
                  <td className="p-3 whitespace-nowrap text-gray-400">{h.tokenIdHex}</td>
                  <td className="p-3 whitespace-nowrap">{h.balanceRaw}</td>
                  <td className="p-3">
                    {h.uri ? (
                      <span className="text-gray-200">{h.uri}</span>
                    ) : h.uriError ? (
                      <span className="text-xs text-amber-300">{h.uriError}</span>
                    ) : (
                      "—"
                    )}
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

      <section className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm text-gray-300">Next</div>
        <ul className="mt-2 list-disc pl-5 text-sm text-gray-400">
          <li>Resolve tokenId → player/asset metadata using `uri(tokenId)` and a base mapping.</li>
          <li>Correlate ERC-1155 transfers with USDC flows to infer buys/sells and price per share.</li>
          <li>Add trade history table (tx hash, direction, tokenId, amount, USDC delta).</li>
        </ul>
      </section>
    </main>
  );
}
