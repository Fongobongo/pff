import { NextResponse } from "next/server";
import { z } from "zod";
import { etherscanV2 } from "@/lib/etherscan";

const paramsSchema = z.object({
  address: z.string().min(1),
});

// Minimal endpoint to validate Base explorer connectivity.
// Later we will build portfolio analytics (token transfers, positions, P/L) on top of these primitives.
export async function GET(
  _request: Request,
  context: { params: Promise<{ address: string }> }
) {
  const { address } = paramsSchema.parse(await context.params);

  const latestTxs = await etherscanV2({
    chainid: 8453,
    module: "account",
    action: "txlist",
    address,
    page: 1,
    offset: 5,
    sort: "desc",
  });

  return NextResponse.json({
    chain: "base",
    address,
    latestTxs,
  });
}
