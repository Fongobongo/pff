import { NextResponse } from "next/server";
import { z } from "zod";
import { isAddress } from "viem";
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

function invalidAddressResponse(address: string) {
  return NextResponse.json(
    {
      error: "invalid_address",
      message: `Invalid EVM address: ${address}`,
    },
    { status: 400 }
  );
}

function isPositiveHexBalance(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
}

// Aggregated wallet view for Base using Alchemy Enhanced APIs.
export async function GET(
  _request: Request,
  context: { params: Promise<{ address: string }> }
) {
  const { address } = paramsSchema.parse(await context.params);
  if (!isAddress(address)) return invalidAddressResponse(address);

  const [nativeBalanceWeiHex, tokenBalancesResult] = await Promise.all([
    alchemyRpc("eth_getBalance", [address, "latest"]),
    alchemyRpc("alchemy_getTokenBalances", [address, [BASE_USDC, FUN_TOKEN_ADDRESS]]),
  ]);

  const tokenBalances: TokenBalance[] = tokenBalancesResult?.tokenBalances ?? [];

  // Keep only positive balances for target contracts.
  const nonZero = tokenBalances.filter((t) => isPositiveHexBalance(t.tokenBalance));
  const allowed = new Set([BASE_USDC, FUN_TOKEN_ADDRESS].map((a) => a.toLowerCase()));
  const filtered = nonZero.filter((t) => allowed.has(t.contractAddress.toLowerCase()));

  // Metadata is best-effort and should not fail the entire endpoint.
  const metaSettled = await Promise.allSettled(
    filtered.map(async (t) => {
      const metadata = (await alchemyRpc("alchemy_getTokenMetadata", [
        t.contractAddress,
      ])) as TokenMetadata;
      return [t.contractAddress.toLowerCase(), metadata] as const;
    })
  );
  const metaEntries = metaSettled
    .filter((entry): entry is PromiseFulfilledResult<readonly [string, TokenMetadata]> => entry.status === "fulfilled")
    .map((entry) => entry.value);

  const tokenMetadataByAddress = Object.fromEntries(metaEntries);

  return NextResponse.json({
    chain: "base",
    address,
    nativeBalanceWeiHex,
    tokenBalances: filtered,
    tokenMetadataByAddress,
  });
}
