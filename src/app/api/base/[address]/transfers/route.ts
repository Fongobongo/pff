import { NextResponse } from "next/server";
import { z } from "zod";
import { alchemyRpc } from "@/lib/alchemy";
import { FUN_TOKEN_ADDRESS } from "@/lib/funToken";
import { BASE_USDC, SPORTFUN_ERC1155_CONTRACTS } from "@/lib/sportfun";

const paramsSchema = z.object({
  address: z.string().min(1),
});

const querySchema = z.object({
  maxCount: z.string().optional(),
});

// Wallet transfer history via Alchemy Enhanced APIs.
// Docs: https://docs.alchemy.com/reference/alchemy-getassettransfers
//
// NOTE: To get "all" transfers for a wallet we query both directions:
// - incoming (toAddress)
// - outgoing (fromAddress)
export async function GET(
  request: Request,
  context: { params: Promise<{ address: string }> }
) {
  const { address } = paramsSchema.parse(await context.params);
  const url = new URL(request.url);
  const q = querySchema.parse(Object.fromEntries(url.searchParams.entries()));

  const maxCount = q.maxCount ?? "0x64"; // 100 per direction

  const baseParams = {
    fromBlock: "0x0",
    toBlock: "latest",
    category: ["external", "erc20", "erc721", "erc1155"],
    withMetadata: true,
    maxCount,
    order: "desc" as const,
  };

  const [incoming, outgoing] = await Promise.all([
    alchemyRpc("alchemy_getAssetTransfers", [
      {
        ...baseParams,
        toAddress: address,
      },
    ]),
    alchemyRpc("alchemy_getAssetTransfers", [
      {
        ...baseParams,
        fromAddress: address,
      },
    ]),
  ]);

  const allowedErc20 = new Set([BASE_USDC, FUN_TOKEN_ADDRESS].map((a) => a.toLowerCase()));
  const allowedErc1155 = new Set(SPORTFUN_ERC1155_CONTRACTS.map((a) => a.toLowerCase()));

  const transfers = [...(incoming?.transfers ?? []), ...(outgoing?.transfers ?? [])].filter((t: {
    category?: string;
    rawContract?: { address?: string };
  }) => {
    const category = (t.category ?? "").toLowerCase();
    const contract = t.rawContract?.address?.toLowerCase();
    if (category === "erc20") return contract ? allowedErc20.has(contract) : false;
    if (category === "erc1155") return contract ? allowedErc1155.has(contract) : false;
    return false;
  });

  type TransferSortKey = {
    blockNum?: string | number;
    uniqueId?: string;
    hash?: string;
  };

  // Best-effort sort: by blockNum desc, then uniqueId/txHash if present.
  transfers.sort((a: TransferSortKey, b: TransferSortKey) => {
    const ab = typeof a.blockNum === "string" ? parseInt(a.blockNum, 16) : (a.blockNum ?? 0);
    const bb = typeof b.blockNum === "string" ? parseInt(b.blockNum, 16) : (b.blockNum ?? 0);
    if (bb !== ab) return bb - ab;
    return String(b.uniqueId ?? b.hash ?? "").localeCompare(String(a.uniqueId ?? a.hash ?? ""));
  });

  return NextResponse.json({
    chain: "base",
    address,
    result: {
      incoming,
      outgoing,
      transfers,
    },
  });
}
