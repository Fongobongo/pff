import Link from "next/link";
import { z } from "zod";
import { isAddress } from "viem";
import SportfunPortfolioClient from "./Client";

const paramsSchema = z.object({
  address: z.string().min(1),
});

export default async function SportfunPortfolioPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = paramsSchema.parse(await params);
  if (!isAddress(address)) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-white">Sport.fun portfolio</h1>
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
  return <SportfunPortfolioClient address={address} />;
}
