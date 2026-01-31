import { NextResponse } from "next/server";
import { z } from "zod";
import { alchemyRpc } from "@/lib/alchemy";

const paramsSchema = z.object({
  address: z.string().min(1),
});

// Native ETH balance on Base.
export async function GET(
  _request: Request,
  context: { params: Promise<{ address: string }> }
) {
  const { address } = paramsSchema.parse(await context.params);

  const balanceWeiHex = await alchemyRpc("eth_getBalance", [address, "latest"]);

  return NextResponse.json({
    chain: "base",
    address,
    balanceWeiHex,
  });
}
