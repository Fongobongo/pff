type FlowRow = {
  asset: string;
  contractAddress?: string;
  inValue: number;
  outValue: number;
  netValue: number;
  inCount: number;
  outCount: number;
  lastTimestamp?: string;
};

export default function FlowsTable({ flows }: { flows: FlowRow[] }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-white">Net flows (token transfers)</h2>
      <p className="mt-1 text-xs text-gray-500">
        Based on recent transfer history (Alchemy). Values are best-effort and may not include swaps
        executed via contracts in the same way a &quot;portfolio&quot; UI would.
      </p>

      <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-gray-300">
            <tr>
              <th className="p-3">Token</th>
              <th className="p-3">In</th>
              <th className="p-3">Out</th>
              <th className="p-3">Net</th>
              <th className="p-3">Tx count</th>
              <th className="p-3">Last</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {flows.length === 0 ? (
              <tr>
                <td className="p-3 text-gray-400" colSpan={6}>
                  No flow data.
                </td>
              </tr>
            ) : (
              flows.slice(0, 25).map((f) => (
                <tr key={(f.contractAddress ?? f.asset) + f.lastTimestamp} className="text-gray-200">
                  <td className="p-3 whitespace-nowrap">{f.asset}</td>
                  <td className="p-3 whitespace-nowrap">{f.inValue.toLocaleString()}</td>
                  <td className="p-3 whitespace-nowrap">{f.outValue.toLocaleString()}</td>
                  <td className="p-3 whitespace-nowrap">
                    <span className={f.netValue >= 0 ? "text-green-400" : "text-red-400"}>
                      {f.netValue.toLocaleString()}
                    </span>
                  </td>
                  <td className="p-3 whitespace-nowrap text-gray-400">
                    {f.inCount + f.outCount} ({f.inCount} in / {f.outCount} out)
                  </td>
                  <td className="p-3 whitespace-nowrap text-gray-400">{f.lastTimestamp ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
