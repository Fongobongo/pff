import { NextResponse } from "next/server";
import { z } from "zod";

const paramsSchema = z.object({
  address: z.string().min(1),
});

// Placeholder: this will later return portfolio history on Base for a wallet address.
// We will likely use a third-party indexer API (e.g., Alchemy) rather than scanning blocks.
export async function GET(
  _request: Request,
  context: { params: Promise<{ address: string }> }
) {
  const { address } = paramsSchema.parse(await context.params);

  return NextResponse.json({
    address,
    network: "base",
    status: "not_implemented",
    notes: "Portfolio history endpoint scaffolded.",
  });
}
