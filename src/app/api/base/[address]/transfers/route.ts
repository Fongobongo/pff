import { NextResponse } from "next/server";
import { z } from "zod";
import { isAddress } from "viem";
import { alchemyRpc } from "@/lib/alchemy";
import { FUN_TOKEN_ADDRESS } from "@/lib/funToken";
import { BASE_USDC, SPORTFUN_ERC1155_CONTRACTS } from "@/lib/sportfun";

const paramsSchema = z.object({
  address: z.string().min(1),
});

const querySchema = z.object({
  maxCount: z.string().optional(),
});

type TransferRaw = {
  uniqueId?: string;
  blockNum?: string;
  hash?: string;
  from?: string;
  to?: string;
  value?: number;
  asset?: string;
  category?: string;
  erc1155Metadata?: Array<{ tokenId?: string; value?: string }>;
  rawContract?: {
    address?: string;
  };
  metadata?: { blockTimestamp?: string };
};

type TransferRow = {
  blockNum?: string;
  hash?: string;
  from?: string;
  to?: string;
  value?: number;
  asset?: string;
  category?: string;
  contractAddress?: string;
  erc1155Metadata?: Array<{ tokenId?: string; value?: string }>;
  metadata?: { blockTimestamp?: string };
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

function normalizeAddr(value?: string): string {
  return (value ?? "").toLowerCase();
}

function transferKey(t: TransferRaw): string {
  if (t.uniqueId) return t.uniqueId;
  return [
    t.hash ?? "",
    t.blockNum ?? "",
    t.from ?? "",
    t.to ?? "",
    t.category ?? "",
    t.rawContract?.address ?? "",
    String(t.value ?? ""),
  ].join(":");
}

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
  if (!isAddress(address)) return invalidAddressResponse(address);
  const url = new URL(request.url);
  const q = querySchema.parse(Object.fromEntries(url.searchParams.entries()));

  const maxCount = q.maxCount ?? "0x64"; // 100 per direction

  const baseParams = {
    fromBlock: "0x0",
    toBlock: "latest",
    category: ["erc20", "erc1155"],
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

  const deduped = new Map<string, TransferRaw>();
  for (const t of [...(incoming?.transfers ?? []), ...(outgoing?.transfers ?? [])] as TransferRaw[]) {
    deduped.set(transferKey(t), t);
  }

  const filtered = [...deduped.values()].filter((t) => {
    const category = (t.category ?? "").toLowerCase();
    const contract = t.rawContract?.address?.toLowerCase();
    if (category === "erc20") return Boolean(contract && allowedErc20.has(contract));
    if (category === "erc1155") return Boolean(contract && allowedErc1155.has(contract));
    return false;
  });

  type TransferSortKey = {
    blockNum?: string | number;
    uniqueId?: string;
    hash?: string;
  };

  // Best-effort sort: by blockNum desc, then uniqueId/txHash if present.
  filtered.sort((a: TransferSortKey, b: TransferSortKey) => {
    const ab = typeof a.blockNum === "string" ? parseInt(a.blockNum, 16) : (a.blockNum ?? 0);
    const bb = typeof b.blockNum === "string" ? parseInt(b.blockNum, 16) : (b.blockNum ?? 0);
    if (bb !== ab) return bb - ab;
    return String(b.uniqueId ?? b.hash ?? "").localeCompare(String(a.uniqueId ?? a.hash ?? ""));
  });

  const walletLc = normalizeAddr(address);
  let incomingCount = 0;
  let outgoingCount = 0;

  const transfers: TransferRow[] = filtered.map((t) => {
    const from = normalizeAddr(t.from);
    const to = normalizeAddr(t.to);
    if (to === walletLc && from !== walletLc) incomingCount++;
    if (from === walletLc && to !== walletLc) outgoingCount++;

    return {
      blockNum: t.blockNum,
      hash: t.hash,
      from: t.from,
      to: t.to,
      value: t.value,
      asset: t.asset,
      category: t.category,
      contractAddress: t.rawContract?.address,
      erc1155Metadata: t.erc1155Metadata,
      metadata: t.metadata ? { blockTimestamp: t.metadata.blockTimestamp } : undefined,
    };
  });

  return NextResponse.json({
    chain: "base",
    address,
    summary: {
      transferCount: transfers.length,
      incomingCount,
      outgoingCount,
    },
    result: {
      transfers,
    },
  });
}
