import { NextResponse } from "next/server";
import { z } from "zod";
import { alchemyRpc } from "@/lib/alchemy";

const paramsSchema = z.object({
  address: z.string().min(1),
});

const querySchema = z.object({
  maxCount: z.string().optional(),
});

type Transfer = {
  from?: string;
  to?: string;
  asset?: string;
  category?: string;
  value?: number;
  rawContract?: {
    address?: string;
    value?: string;
    decimal?: string;
  };
  metadata?: {
    blockTimestamp?: string;
  };
};

function normalizeAddr(a?: string) {
  return (a ?? "").toLowerCase();
}

export async function GET(
  request: Request,
  context: { params: Promise<{ address: string }> }
) {
  const { address } = paramsSchema.parse(await context.params);
  const url = new URL(request.url);
  const q = querySchema.parse(Object.fromEntries(url.searchParams.entries()));

  const maxCount = q.maxCount ?? "0xC8"; // 200 per direction

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

  const transfers: Transfer[] = [
    ...(incoming?.transfers ?? []),
    ...(outgoing?.transfers ?? []),
  ];

  const me = normalizeAddr(address);
  const byToken: Record<
    string,
    {
      asset: string;
      contractAddress?: string;
      inValue: number;
      outValue: number;
      netValue: number;
      inCount: number;
      outCount: number;
      lastTimestamp?: string;
    }
  > = {};

  for (const t of transfers) {
    const asset = t.asset ?? t.category ?? "unknown";
    const contractAddress = t.rawContract?.address;

    // Use contract address when possible; fallback to asset name.
    const key = (contractAddress ?? asset).toLowerCase();

    const from = normalizeAddr(t.from);
    const to = normalizeAddr(t.to);
    const value = typeof t.value === "number" ? t.value : 0;

    if (!byToken[key]) {
      byToken[key] = {
        asset,
        contractAddress,
        inValue: 0,
        outValue: 0,
        netValue: 0,
        inCount: 0,
        outCount: 0,
        lastTimestamp: t.metadata?.blockTimestamp,
      };
    }

    // best-effort last seen
    if (t.metadata?.blockTimestamp && (!byToken[key].lastTimestamp || t.metadata.blockTimestamp > byToken[key].lastTimestamp!)) {
      byToken[key].lastTimestamp = t.metadata.blockTimestamp;
    }

    const isIncoming = to === me && from !== me;
    const isOutgoing = from === me && to !== me;

    if (isIncoming) {
      byToken[key].inValue += value;
      byToken[key].inCount += 1;
    } else if (isOutgoing) {
      byToken[key].outValue += value;
      byToken[key].outCount += 1;
    } else {
      // self-transfer or unknown direction; ignore for flows
    }

    byToken[key].netValue = byToken[key].inValue - byToken[key].outValue;
  }

  const flows = Object.values(byToken).sort((a, b) => Math.abs(b.netValue) - Math.abs(a.netValue));

  return NextResponse.json({
    chain: "base",
    address,
    summary: {
      tokenCount: flows.length,
      transferCount: transfers.length,
    },
    flows,
  });
}
