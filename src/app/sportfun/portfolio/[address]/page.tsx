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
    activityCount: number;
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
  holdings: Array<{
    contractAddress: string;
    tokenIdHex: string;
    tokenIdDec: string;
    balanceRaw: string;
    uri?: string;
    uriError?: string;
  }>;
  activity: Array<{
    hash: string;
    timestamp?: string;
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
          <div className="text-sm text-gray-400">Contracts</div>
          <div className="mt-2 text-xl text-white">{data.summary.contractCount}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Tx activity</div>
          <div className="mt-2 text-xl text-white">{data.summary.activityCount}</div>
          <p className="mt-1 text-xs text-gray-500">ERC-1155 grouped by tx hash.</p>
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

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">Activity (tx grouped)</h2>
        <p className="mt-1 text-sm text-gray-400">{data.assumptions.usdc.note}</p>

        <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-gray-300">
              <tr>
                <th className="p-3">Time</th>
                <th className="p-3">Inferred</th>
                <th className="p-3">USDC delta</th>
                <th className="p-3">ERC-1155 changes</th>
                <th className="p-3">Tx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {data.activity.slice(0, 50).map((a) => (
                <tr key={a.hash} className="text-gray-200">
                  <td className="p-3 whitespace-nowrap text-gray-400">{a.timestamp ?? "—"}</td>
                  <td className="p-3 whitespace-nowrap">
                    {a.inferred?.kind && a.inferred.kind !== "unknown" ? (
                      <div className="flex flex-col">
                        <span className={a.inferred.kind === "buy" ? "text-green-400" : "text-red-400"}>
                          {a.inferred.kind.toUpperCase()}
                        </span>
                        {a.inferred.priceUsdcPerShareRaw ? (
                          <span className="text-xs text-gray-400">
                            ~{formatFixed(a.inferred.priceUsdcPerShareRaw, data.assumptions.usdc.decimals)} USDC/share
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <span
                      className={
                        BigInt(a.usdcDeltaRaw) >= 0n ? "text-green-400" : "text-red-400"
                      }
                    >
                      {formatFixed(a.usdcDeltaRaw, data.assumptions.usdc.decimals)}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      {a.erc1155Changes.slice(0, 6).map((c) => (
                        <div key={`${c.contractAddress}:${c.tokenIdHex}`} className="text-xs">
                          <span className="text-gray-400">{shortenAddress(c.contractAddress)}</span>{" "}
                          <span className="text-gray-200">tokenId {c.tokenIdDec}</span>{" "}
                          <span className={BigInt(c.deltaRaw) >= 0n ? "text-green-400" : "text-red-400"}>
                            {c.deltaRaw}
                          </span>
                        </div>
                      ))}
                      {a.erc1155Changes.length > 6 ? (
                        <div className="text-xs text-gray-500">+{a.erc1155Changes.length - 6} more…</div>
                      ) : null}
                    </div>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <div className="flex flex-col">
                      <a
                        className="text-blue-400 hover:underline"
                        href={`/sportfun/tx/${a.hash}`}
                      >
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

      <section className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm text-gray-300">Next</div>
        <ul className="mt-2 list-disc pl-5 text-sm text-gray-400">
          <li>Resolve tokenId → player/asset metadata (the `uri(tokenId)` return value needs interpretation).</li>
          <li>Decode receipts/logs for representative tx hashes to confirm market/bonding-curve contracts.</li>
          <li>Compute per-trade price per share + cost basis from USDC deltas.</li>
        </ul>
      </section>
    </main>
  );
}
