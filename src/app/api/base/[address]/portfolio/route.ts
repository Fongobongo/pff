import { NextResponse } from "next/server";
import { z } from "zod";
import { alchemyRpc } from "@/lib/alchemy";
import { FUN_TOKEN_ADDRESS } from "@/lib/funToken";
import { BASE_USDC } from "@/lib/sportfun";

const paramsSchema = z.object({
  address: z.string().min(1),
});

type TokenBalance = {
  contractAddress: string;
  tokenBalance: string;
};

type TokenMetadata = {
  decimals: number;
  logo?: string | null;
  name?: string | null;
  symbol?: string | null;
};

// Aggregated wallet view for Base using Alchemy Enhanced APIs.
export async function GET(
  _request: Request,
  context: { params: Promise<{ address: string }> }
) {
  const { address } = paramsSchema.parse(await context.params);

  const [nativeBalanceWeiHex, tokenBalancesResult] = await Promise.all([
    alchemyRpc("eth_getBalance", [address, "latest"]),
    alchemyRpc("alchemy_getTokenBalances", [address, "DEFAULT_TOKENS"]),
  ]);

  const tokenBalances: TokenBalance[] = tokenBalancesResult?.tokenBalances ?? [];

  // Filter out empty balances (Alchemy uses "0x0")
  const nonZero = tokenBalances.filter(
    (t) => typeof t.tokenBalance === "string" && t.tokenBalance !== "0x0"
  );
  const allowed = new Set([BASE_USDC, FUN_TOKEN_ADDRESS].map((a) => a.toLowerCase()));
  const filtered = nonZero.filter((t) => allowed.has(t.contractAddress.toLowerCase()));

  // Fetch metadata for each token (limit concurrency implicitly via Promise.all on small set)
  const metaEntries = await Promise.all(
    filtered.map(async (t) => {
      const metadata = (await alchemyRpc("alchemy_getTokenMetadata", [
        t.contractAddress,
      ])) as TokenMetadata;
      return [t.contractAddress.toLowerCase(), metadata] as const;
    })
  );

  const tokenMetadataByAddress = Object.fromEntries(metaEntries);

  return NextResponse.json({
    chain: "base",
    address,
    nativeBalanceWeiHex,
    tokenBalances: filtered,
    tokenMetadataByAddress,
  });
}
