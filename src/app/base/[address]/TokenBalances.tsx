import { formatUnitsFromHex, type TokenMetadata } from "@/lib/token";

export default function TokenBalances({
  tokenBalances,
  tokenMetadataByAddress,
}: {
  tokenBalances: Array<{ contractAddress: string; tokenBalance: string }>;
  tokenMetadataByAddress: Record<string, TokenMetadata>;
}) {
  const nonZero = tokenBalances.filter((t) => t.tokenBalance !== "0x0");

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-white">Token balances</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-gray-300">
            <tr>
              <th className="p-3">Token</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Contract</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {nonZero.length === 0 ? (
              <tr>
                <td className="p-3 text-gray-400" colSpan={3}>
                  No token balances found.
                </td>
              </tr>
            ) : (
              nonZero.map((t) => {
                const meta = tokenMetadataByAddress[t.contractAddress.toLowerCase()];
                const symbol = meta?.symbol ?? "(unknown)";
                const decimals = meta?.decimals ?? 0;
                const amount = formatUnitsFromHex(t.tokenBalance, decimals);

                return (
                  <tr key={t.contractAddress} className="text-gray-200">
                    <td className="p-3 whitespace-nowrap">{symbol}</td>
                    <td className="p-3 whitespace-nowrap">{amount}</td>
                    <td className="p-3 text-gray-400">{t.contractAddress}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
