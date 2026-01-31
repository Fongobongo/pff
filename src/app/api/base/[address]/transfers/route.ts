import { NextResponse } from "next/server";
import { z } from "zod";
import { alchemyRpc } from "@/lib/alchemy";

const paramsSchema = z.object({
  address: z.string().min(1),
});

const querySchema = z.object({
  maxCount: z.string().optional(),
});

// Wallet transfer history via Alchemy Enhanced APIs.
// Docs: https://docs.alchemy.com/reference/alchemy-getassettransfers
export async function GET(
  request: Request,
  context: { params: Promise<{ address: string }> }
) {
  const { address } = paramsSchema.parse(await context.params);
  const url = new URL(request.url);
  const q = querySchema.parse(Object.fromEntries(url.searchParams.entries()));

  const maxCount = q.maxCount ?? "0x64"; // 100

  const result = await alchemyRpc("alchemy_getAssetTransfers", [
    {
      fromBlock: "0x0",
      toBlock: "latest",
      fromAddress: address,
      toAddress: address,
      category: ["external", "erc20", "erc721", "erc1155"],
      withMetadata: true,
      maxCount,
      order: "desc",
    },
  ]);

  return NextResponse.json({
    chain: "base",
    address,
    result,
  });
}
