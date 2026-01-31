import { NextResponse } from "next/server";
import { z } from "zod";
import { alchemyRpc } from "@/lib/alchemy";

const paramsSchema = z.object({
  address: z.string().min(1),
});

// Token balances via Alchemy Enhanced APIs.
// Docs: https://docs.alchemy.com/reference/alchemy-gettokenbalances
export async function GET(
  _request: Request,
  context: { params: Promise<{ address: string }> }
) {
  const { address } = paramsSchema.parse(await context.params);

  const result = await alchemyRpc("alchemy_getTokenBalances", [address, "DEFAULT_TOKENS"]);

  return NextResponse.json({
    chain: "base",
    address,
    result,
  });
}
