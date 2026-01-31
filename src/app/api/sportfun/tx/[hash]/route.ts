import { NextResponse } from "next/server";
import { z } from "zod";
import { alchemyRpc } from "@/lib/alchemy";
import { decodeEventLog, type Abi, type Hex, hexToBigInt, isHex } from "viem";

const paramsSchema = z.object({
  hash: z
    .string()
    .min(1)
    .refine((v) => isHex(v) && v.length === 66, "Expected a 0x-prefixed 32-byte tx hash"),
});

type ReceiptLog = {
  address: string;
  topics: string[];
  data: string;
  logIndex?: string;
  transactionHash?: string;
};

type TxReceipt = {
  transactionHash: string;
  status?: string;
  blockNumber?: string;
  gasUsed?: string;
  logs: ReceiptLog[];
};

const ERC20_ABI: Abi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
];

const ERC1155_ABI: Abi = [
  {
    type: "event",
    name: "TransferSingle",
    inputs: [
      { name: "operator", type: "address", indexed: true },
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "id", type: "uint256", indexed: false },
      { name: "value", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "TransferBatch",
    inputs: [
      { name: "operator", type: "address", indexed: true },
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "ids", type: "uint256[]", indexed: false },
      { name: "values", type: "uint256[]", indexed: false },
    ],
    anonymous: false,
  },
];

const ERC721_ABI: Abi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
    anonymous: false,
  },
];

// Known topic0 values (keccak256 of canonical event signature)
const TOPIC_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TOPIC_ERC1155_TRANSFER_SINGLE =
  "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
const TOPIC_ERC1155_TRANSFER_BATCH =
  "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb";

function safeToLower(s: string | undefined): string {
  return (s ?? "").toLowerCase();
}

function topic0(log: ReceiptLog): string {
  return (log.topics?.[0] ?? "").toLowerCase();
}

export async function GET(_request: Request, context: { params: Promise<{ hash: string }> }) {
  const { hash } = paramsSchema.parse(await context.params);

  const receipt = (await alchemyRpc("eth_getTransactionReceipt", [hash])) as TxReceipt | null;
  if (!receipt) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  // Fast topic0 recognition for common standards.
  // NOTE: ERC-20 Transfer and ERC-721 Transfer share the same topic0; disambiguate by topics length.

  const decoded: Array<
    | {
        kind: "decoded";
        label: string;
        address: string;
        eventName: string;
        args: Record<string, unknown>;
        logIndex?: string;
      }
    | {
        kind: "unknown";
        address: string;
        topic0: string;
        topics: string[];
        data: string;
        logIndex?: string;
      }
  > = [];

  const addresses = new Set<string>();
  const topic0Counts = new Map<string, number>();

  for (const log of receipt.logs ?? []) {
    const addr = safeToLower(log.address);
    addresses.add(addr);

    const t0 = topic0(log);
    topic0Counts.set(t0, (topic0Counts.get(t0) ?? 0) + 1);

    const rawTopics = (log.topics ?? []) as Hex[];
    if (rawTopics.length === 0) {
      decoded.push({
        kind: "unknown",
        address: addr,
        topic0: t0,
        topics: (log.topics ?? []),
        data: log.data,
        logIndex: log.logIndex,
      });
      continue;
    }

    const topics = rawTopics as [Hex, ...Hex[]];

    let label: string | undefined;
    let abi: Abi | undefined;

    if (t0 === TOPIC_TRANSFER) {
      // ERC-20 Transfer has 3 topics total (topic0 + from + to)
      // ERC-721 Transfer has 4 topics total (topic0 + from + to + tokenId)
      label = topics.length === 4 ? "erc721" : "erc20";
      abi = topics.length === 4 ? ERC721_ABI : ERC20_ABI;
    } else if (t0 === TOPIC_ERC1155_TRANSFER_SINGLE) {
      label = "erc1155";
      abi = ERC1155_ABI;
    } else if (t0 === TOPIC_ERC1155_TRANSFER_BATCH) {
      label = "erc1155";
      abi = ERC1155_ABI;
    }

    if (!label || !abi) {
      decoded.push({
        kind: "unknown",
        address: addr,
        topic0: t0,
        topics: (log.topics ?? []),
        data: log.data,
        logIndex: log.logIndex,
      });
      continue;
    }

    try {
      const out = decodeEventLog({
        abi,
        data: log.data as Hex,
        topics,
      });

      // Normalize bigint to string for JSON.
      const args: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(out.args ?? {})) {
        if (typeof v === "bigint") args[k] = v.toString(10);
        else if (Array.isArray(v) && v.every((x) => typeof x === "bigint")) {
          args[k] = (v as bigint[]).map((x) => x.toString(10));
        } else args[k] = v;
      }

      decoded.push({
        kind: "decoded",
        label,
        address: addr,
        eventName: out.eventName ?? "unknown",
        args,
        logIndex: log.logIndex,
      });
    } catch {
      decoded.push({
        kind: "unknown",
        address: addr,
        topic0: t0,
        topics: log.topics ?? [],
        data: log.data,
        logIndex: log.logIndex,
      });
    }
  }

  const gasUsed = receipt.gasUsed ? hexToBigInt(receipt.gasUsed as Hex).toString(10) : undefined;

  return NextResponse.json({
    chain: "base",
    txHash: receipt.transactionHash,
    receipt: {
      status: receipt.status,
      blockNumber: receipt.blockNumber,
      gasUsed,
      logCount: receipt.logs?.length ?? 0,
    },
    summary: {
      addressCount: addresses.size,
      uniqueTopic0Count: topic0Counts.size,
    },
    addresses: [...addresses],
    topic0Counts: [...topic0Counts.entries()]
      .map(([topic0, count]) => ({ topic0, count }))
      .sort((a, b) => b.count - a.count),
    logs: decoded,
  });
}
