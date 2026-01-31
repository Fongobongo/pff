import { NextResponse } from "next/server";
import { z } from "zod";
import { alchemyRpc } from "@/lib/alchemy";
import { shortenAddress } from "@/lib/format";
import { decodeAbiParameters, type Hex } from "viem";

const paramsSchema = z.object({
  address: z.string().min(1),
});

const querySchema = z.object({
  maxCount: z.string().optional(),
  maxPages: z.string().optional(),
});

// Sport.fun (Sport.fun / pro.football.fun) portfolio reconstruction (WIP).
//
// Current approach (minimal viable):
// - Pull ERC-1155 transfers for a wallet via Alchemy Enhanced APIs.
// - Compute net balances per (contract, tokenId) by aggregating incoming/outgoing.
// - Best-effort fetch token metadata using ERC-1155 `uri(uint256)`.
//
// Known Sport.fun-related ERC-1155 contracts observed for our test wallet.
// NOTE: We keep this list explicit for now to avoid mis-attributing unrelated ERC-1155 activity.
const SPORTFUN_ERC1155_CONTRACTS = [
  "0x71c8b0c5148edb0399d1edf9bf0c8c81dea16918",
  "0x2eef466e802ab2835ab81be63eebc55167d35b56",
] as const;

type SportfunErc1155Contract = (typeof SPORTFUN_ERC1155_CONTRACTS)[number];

function isSportfunErc1155Contract(addr: string): addr is SportfunErc1155Contract {
  return (SPORTFUN_ERC1155_CONTRACTS as readonly string[]).includes(addr);
}

type AlchemyTransfer = {
  category?: string;
  uniqueId?: string;
  hash?: string;
  from?: string;
  to?: string;
  metadata?: { blockTimestamp?: string };
  rawContract?: { address?: string };
  erc1155Metadata?: Array<{ tokenId: string; value: string }>;
};

function toLower(s: string | undefined): string {
  return (s ?? "").toLowerCase();
}

function parseBigIntish(value: unknown): bigint {
  if (typeof value !== "string") throw new Error(`Expected string, got ${typeof value}`);
  if (value.startsWith("0x") || value.startsWith("0X")) return BigInt(value);
  return BigInt(value);
}

function pad32(hexNoPrefix: string): string {
  return hexNoPrefix.padStart(64, "0");
}

function encodeErc1155UriCall(tokenId: bigint): Hex {
  // selector = keccak256("uri(uint256)") => 0x0e89341c
  const selector = "0x0e89341c";
  const tokenHex = tokenId.toString(16);
  return `${selector}${pad32(tokenHex)}` as Hex;
}

function decodeAbiString(hex: Hex): string {
  const [s] = decodeAbiParameters([{ type: "string" }], hex);
  return String(s);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;

  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => worker());
  await Promise.all(workers);
  return out;
}

async function fetchErc1155TransfersForWallet(params: {
  address: string;
  direction: "incoming" | "outgoing";
  maxCount: string;
  maxPages: number;
}): Promise<AlchemyTransfer[]> {
  const baseParams: {
    fromBlock: string;
    toBlock: "latest";
    category: ["erc1155"];
    withMetadata: true;
    maxCount: string;
    order: "desc";
  } = {
    fromBlock: "0x0",
    toBlock: "latest",
    category: ["erc1155"],
    withMetadata: true,
    maxCount: params.maxCount,
    order: "desc",
  };

  let pageKey: string | undefined;
  const all: AlchemyTransfer[] = [];

  for (let page = 0; page < params.maxPages; page++) {
    const result = (await alchemyRpc("alchemy_getAssetTransfers", [
      {
        ...baseParams,
        ...(params.direction === "incoming"
          ? { toAddress: params.address }
          : { fromAddress: params.address }),
        ...(pageKey ? { pageKey } : {}),
      },
    ])) as { transfers?: AlchemyTransfer[]; pageKey?: string };

    const transfers = result.transfers ?? [];
    all.push(...transfers);

    pageKey = result?.pageKey;
    if (!pageKey) break;
  }

  return all;
}

export async function GET(request: Request, context: { params: Promise<{ address: string }> }) {
  const { address } = paramsSchema.parse(await context.params);
  const url = new URL(request.url);
  const q = querySchema.parse(Object.fromEntries(url.searchParams.entries()));

  const wallet = address;
  const walletLc = wallet.toLowerCase();

  const maxCount = q.maxCount ?? "0x3e8"; // 1000 per page
  const maxPages = Math.max(1, Math.min(10, q.maxPages ? Number(q.maxPages) : 3));

  const [incoming, outgoing] = await Promise.all([
    fetchErc1155TransfersForWallet({ address: wallet, direction: "incoming", maxCount, maxPages }),
    fetchErc1155TransfersForWallet({ address: wallet, direction: "outgoing", maxCount, maxPages }),
  ]);

  const transfers = [...incoming, ...outgoing];

  // De-dupe (incoming+outgoing can overlap only in edge cases, but we keep it safe).
  const byId = new Map<string, AlchemyTransfer>();
  for (const t of transfers) {
    const id = t.uniqueId ?? `${t.hash ?? ""}:${t.from ?? ""}:${t.to ?? ""}:${t.category ?? ""}`;
    if (!byId.has(id)) byId.set(id, t);
  }

  const deduped = [...byId.values()];

  // Aggregate balances per (contract, tokenId).
  const balances = new Map<string, bigint>();
  const contractSet = new Set<string>();

  for (const t of deduped) {
    const contract = toLower(t.rawContract?.address);
    if (!contract) continue;

    // Only consider known Sport.fun ERC-1155 contracts for now.
    if (!isSportfunErc1155Contract(contract)) continue;

    contractSet.add(contract);

    const fromLc = toLower(t.from);
    const toLc = toLower(t.to);

    const metas = t.erc1155Metadata ?? [];
    for (const m of metas) {
      const tokenId = parseBigIntish(m.tokenId);
      const value = parseBigIntish(m.value);

      const key = `${contract}:${tokenId.toString(16)}`;
      const prev = balances.get(key) ?? 0n;

      let next = prev;
      if (toLc === walletLc) next = prev + value;
      if (fromLc === walletLc) next = next - value;

      balances.set(key, next);
    }
  }

  const holdings = [...balances.entries()]
    .map(([key, balanceRaw]) => {
      const [contractAddress, tokenIdHexNoPrefix] = key.split(":");
      const tokenId = BigInt(`0x${tokenIdHexNoPrefix}`);

      return {
        contractAddress,
        tokenIdHex: `0x${tokenIdHexNoPrefix}`,
        tokenIdDec: tokenId.toString(10),
        balanceRaw: balanceRaw.toString(10),
      };
    })
    .filter((h) => h.balanceRaw !== "0")
    .sort((a, b) => {
      const ab = BigInt(a.balanceRaw);
      const bb = BigInt(b.balanceRaw);
      if (bb === ab) return 0;
      return bb > ab ? 1 : -1;
    });

  // Best-effort ERC-1155 URI lookups (only for non-zero holdings).
  const uriByKey = new Map<string, { uri?: string; error?: string }>();

  await mapLimit(holdings, 8, async (h) => {
    const key = `${h.contractAddress}:${h.tokenIdHex}`;
    try {
      const data = encodeErc1155UriCall(BigInt(h.tokenIdHex));
      const result = (await alchemyRpc("eth_call", [{ to: h.contractAddress, data }, "latest"])) as Hex;
      const uri = decodeAbiString(result);
      uriByKey.set(key, { uri });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      uriByKey.set(key, { error: msg });
    }
  });

  const holdingsEnriched = holdings.map((h) => {
    const meta = uriByKey.get(`${h.contractAddress}:${h.tokenIdHex}`);
    return {
      ...h,
      uri: meta?.uri,
      uriError: meta?.error,
    };
  });

  return NextResponse.json({
    chain: "base",
    protocol: "sportfun",
    address: wallet,
    assumptions: {
      shareUnits: "ERC-1155 transfer values look like fixed-point; UI formatting is TBD",
      knownContracts: SPORTFUN_ERC1155_CONTRACTS,
    },
    summary: {
      erc1155TransferCount: deduped.length,
      sportfunErc1155TransferCount: deduped.filter((t) => {
        const c = toLower(t.rawContract?.address);
        return c ? isSportfunErc1155Contract(c) : false;
      }).length,
      contractCount: contractSet.size,
      holdingCount: holdingsEnriched.length,
    },
    holdings: holdingsEnriched,
    debug: {
      // Helpful during contract discovery.
      contracts: [...contractSet].map((c) => ({ address: c, label: shortenAddress(c) })),
    },
  });
}
