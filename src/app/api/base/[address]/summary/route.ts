import { NextResponse } from "next/server";
import { z } from "zod";
import { isAddress } from "viem";
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
  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success || !isAddress(parsedParams.data.address)) {
    return NextResponse.json(
      {
        error: "invalid_address",
        message: "Address must be a valid EVM address.",
      },
      { status: 400 }
    );
  }

  const { address } = parsedParams.data;
  try {
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch Base summary";
    return NextResponse.json(
      {
        chain: "base",
        address,
        latestTxs: null,
        error: "explorer_unavailable",
        message,
      },
      { status: 503 }
    );
  }
}
