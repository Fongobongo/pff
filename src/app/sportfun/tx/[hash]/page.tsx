import Link from "next/link";
import { z } from "zod";
import { shortenAddress } from "@/lib/format";
import { getBaseUrl } from "@/lib/serverBaseUrl";

const paramsSchema = z.object({
  hash: z.string().min(1),
});

type TxInspectorResponse = {
  chain: string;
  txHash: string;
  receipt: {
    status?: string;
    blockNumber?: string;
    gasUsed?: string;
    logCount: number;
  };
  summary: {
    addressCount: number;
    uniqueTopic0Count: number;
  };
  addresses: string[];
  topic0Counts: Array<{ topic0: string; count: number }>;
  logs: Array<
    | {
        kind: "decoded";
        label: string;
        address: string;
        eventName: string;
        args: Record<string, unknown>;
        logIndex?: string;
      }
    | {
        kind: "unknown";
        address: string;
        topic0: string;
        topics: string[];
        data: string;
        logIndex?: string;
      }
  >;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  return res.json();
}

export default async function SportfunTxInspectorPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = paramsSchema.parse(await params);

  const base = await getBaseUrl();
  const data = await getJson<TxInspectorResponse>(`${base}/api/sportfun/tx/${hash}`);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Tx inspector (WIP)</h1>
          <p className="text-sm text-gray-400">{data.txHash}</p>
        </div>
        <div className="flex items-center gap-4">
          <Link className="text-sm text-blue-400 hover:underline" href="/">
            Home
          </Link>
          <a
            className="text-sm text-blue-400 hover:underline"
            href={`https://basescan.org/tx/${data.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            Basescan
          </a>
        </div>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Logs</div>
          <div className="mt-2 text-xl text-white">{data.receipt.logCount}</div>
          <p className="mt-1 text-xs text-gray-500">Decoded: ERC-20/721/1155 only.</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Unique addresses</div>
          <div className="mt-2 text-xl text-white">{data.summary.addressCount}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-gray-400">Gas used</div>
          <div className="mt-2 text-xl text-white">{data.receipt.gasUsed ?? "—"}</div>
          <p className="mt-1 text-xs text-gray-500">(decimal)</p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">Addresses</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-gray-300">
              <tr>
                <th className="p-3">Address</th>
                <th className="p-3">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {data.addresses.map((a) => (
                <tr key={a} className="text-gray-200">
                  <td className="p-3 whitespace-nowrap">{a}</td>
                  <td className="p-3 whitespace-nowrap">
                    <a
                      className="text-blue-400 hover:underline"
                      href={`https://basescan.org/address/${a}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {shortenAddress(a)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">Logs</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-gray-300">
              <tr>
                <th className="p-3">Kind</th>
                <th className="p-3">Address</th>
                <th className="p-3">Event</th>
                <th className="p-3">Args / Topic0</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {data.logs.slice(0, 200).map((l, i) => (
                <tr key={`${l.kind}-${i}`} className="text-gray-200 align-top">
                  <td className="p-3 whitespace-nowrap text-gray-400">{l.kind}</td>
                  <td className="p-3 whitespace-nowrap">{shortenAddress(l.address)}</td>
                  <td className="p-3 whitespace-nowrap">
                    {l.kind === "decoded" ? `${l.label}:${l.eventName}` : "unknown"}
                  </td>
                  <td className="p-3">
                    {l.kind === "decoded" ? (
                      <pre className="whitespace-pre-wrap text-xs text-gray-300">
                        {JSON.stringify(l.args, null, 2)}
                      </pre>
                    ) : (
                      <div className="text-xs text-gray-300">
                        <div>topic0: {l.topic0}</div>
                        <div>topics: {l.topics.length}</div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {data.logs.length === 0 ? (
                <tr>
                  <td className="p-3 text-gray-400" colSpan={4}>
                    No logs.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
