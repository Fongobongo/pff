import fs from "node:fs";
import path from "node:path";

const WALLET = process.argv[2] ?? "0x82c117A68fD47A2d53b997049F4BE44714D57455";
const MAX_TX = Number(process.argv[3] ?? "12");

const SPORTFUN_ERC1155_CONTRACTS = [
  "0x71c8b0c5148edb0399d1edf9bf0c8c81dea16918",
  "0x2eef466e802ab2835ab81be63eebc55167d35b56",
];

function parseEnvFile(p) {
  if (!fs.existsSync(p)) return {};
  const raw = fs.readFileSync(p, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const k = trimmed.slice(0, idx).trim();
    let v = trimmed.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function getAlchemyKey() {
  if (process.env.ALCHEMY_API_KEY) return process.env.ALCHEMY_API_KEY;

  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, ".env.local"),
    path.join(cwd, ".env"),
  ];

  for (const p of candidates) {
    const env = parseEnvFile(p);
    if (env.ALCHEMY_API_KEY) return env.ALCHEMY_API_KEY;
  }

  throw new Error(
    "Missing ALCHEMY_API_KEY (set env var or add it to .env.local / .env)."
  );
}

const ALCHEMY_API_KEY = getAlchemyKey();
const RPC_URL = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;

async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status} ${res.statusText}`);
  const data = await res.json();
  if (data.error) throw new Error(`RPC error: ${data.error.code} ${data.error.message}`);
  return data.result;
}

function dedupeTransfers(transfers) {
  const byId = new Map();
  for (const t of transfers) {
    const id = t.uniqueId ?? `${t.hash ?? ""}:${t.from ?? ""}:${t.to ?? ""}:${t.category ?? ""}`;
    if (!byId.has(id)) byId.set(id, t);
  }
  return [...byId.values()];
}

async function getErc1155Transfers(direction) {
  // Docs: https://docs.alchemy.com/reference/alchemy-getassettransfers
  return rpc("alchemy_getAssetTransfers", [
    {
      fromBlock: "0x0",
      toBlock: "latest",
      category: ["erc1155"],
      contractAddresses: SPORTFUN_ERC1155_CONTRACTS,
      withMetadata: true,
      maxCount: "0x3e8",
      order: "desc",
      ...(direction === "incoming" ? { toAddress: WALLET } : { fromAddress: WALLET }),
    },
  ]);
}

async function main() {
  const [incoming, outgoing] = await Promise.all([
    getErc1155Transfers("incoming"),
    getErc1155Transfers("outgoing"),
  ]);

  const transfers = dedupeTransfers([...(incoming?.transfers ?? []), ...(outgoing?.transfers ?? [])]);

  const hashes = [];
  const seen = new Set();
  for (const t of transfers) {
    const h = t.hash;
    if (!h) continue;
    if (seen.has(h)) continue;
    seen.add(h);
    hashes.push(h);
    if (hashes.length >= MAX_TX) break;
  }

  const receipts = [];
  for (const h of hashes) {
    const r = await rpc("eth_getTransactionReceipt", [h]);
    receipts.push(r);
  }

  const report = receipts.map((r) => {
    const addresses = new Map();
    const topic0Counts = new Map();

    for (const log of r.logs ?? []) {
      const addr = String(log.address ?? "").toLowerCase();
      addresses.set(addr, (addresses.get(addr) ?? 0) + 1);
      const t0 = String((log.topics?.[0] ?? "")).toLowerCase();
      topic0Counts.set(t0, (topic0Counts.get(t0) ?? 0) + 1);
    }

    const topAddresses = [...addresses.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([address, count]) => ({ address, count }));

    const topTopics = [...topic0Counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([topic0, count]) => ({ topic0, count }));

    return {
      txHash: r.transactionHash,
      status: r.status,
      blockNumber: r.blockNumber,
      logCount: r.logs?.length ?? 0,
      topAddresses,
      topTopics,
    };
  });

  console.log(
    JSON.stringify(
      {
        chain: "base",
        wallet: WALLET,
        contracts: SPORTFUN_ERC1155_CONTRACTS,
        txCount: report.length,
        tx: report,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
