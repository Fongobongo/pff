import fs from "node:fs";
import path from "node:path";

const MAX_TOKENS = Number(process.argv[2] ?? "6");
const BLOCK_LOOKBACK = BigInt(process.argv[3] ?? "120000");

const SPORTFUN_ERC1155_CONTRACTS = [
  "0x71c8b0c5148edb0399d1edf9bf0c8c81dea16918",
  "0x2eef466e802ab2835ab81be63eebc55167d35b56",
];

const DEFAULT_BASE = "https://api.sport.fun/athletes";

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
    if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function getAlchemyKey() {
  if (process.env.ALCHEMY_API_KEY) return process.env.ALCHEMY_API_KEY;
  const cwd = process.cwd();
  const candidates = [path.join(cwd, ".env.local"), path.join(cwd, ".env")];
  for (const p of candidates) {
    const env = parseEnvFile(p);
    if (env.ALCHEMY_API_KEY) return env.ALCHEMY_API_KEY;
  }
  throw new Error("Missing ALCHEMY_API_KEY (set env var or add it to .env.local / .env).");
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

function normalizeToHttp(uri) {
  if (uri.startsWith("ipfs://")) {
    let rest = uri.slice("ipfs://".length);
    if (rest.startsWith("ipfs/")) rest = rest.slice("ipfs/".length);
    return `https://ipfs.io/ipfs/${rest}`;
  }
  if (uri.startsWith("ar://")) {
    return `https://arweave.net/${uri.slice("ar://".length)}`;
  }
  return uri;
}

function toHex(value) {
  return `0x${value.toString(16)}`;
}

function buildTemplate(base) {
  const trimmed = (base ?? "").trim();
  if (!trimmed) return `${DEFAULT_BASE}/{id}/metadata.json`;
  if (trimmed.includes("{id}")) return trimmed;
  return `${trimmed.replace(/\/+$/, "")}/{id}/metadata.json`;
}

function applyTemplate(template, id) {
  return template.includes("{id}") ? template.replace(/\{id\}/gi, id) : template;
}

function isNumeric(value) {
  return /^\d+$/.test(String(value).trim());
}

function formatErc1155TokenIdHex(tokenId) {
  return tokenId.toString(16).padStart(64, "0");
}

function expandErc1155Uri(template, tokenId) {
  return template.replace(/\{id\}/gi, formatErc1155TokenIdHex(tokenId));
}

async function getRecentTransfers(fromBlock, toBlock) {
  return rpc("alchemy_getAssetTransfers", [
    {
      fromBlock,
      toBlock,
      category: ["erc1155"],
      contractAddresses: SPORTFUN_ERC1155_CONTRACTS,
      withMetadata: true,
      maxCount: "0x64",
      order: "desc",
    },
  ]);
}

function pickTokenIds(transfers, limit) {
  const out = [];
  const seen = new Set();
  for (const t of transfers) {
    const contract = (t.rawContract?.address ?? "").toLowerCase();
    for (const meta of t.erc1155Metadata ?? []) {
      const tokenId = meta.tokenId;
      const key = `${contract}:${tokenId}`;
      if (!contract || !tokenId || seen.has(key)) continue;
      seen.add(key);
      out.push({ contract, tokenId });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function buildCandidates({ uriRaw, tokenId, template, defaultTemplate }) {
  const candidates = [];
  const tokenIdDec = tokenId.toString(10);

  const add = (url) => {
    if (!url || candidates.includes(url)) return;
    candidates.push(url);
  };

  const trimmed = uriRaw.trim();
  if (trimmed) {
    if (isNumeric(trimmed)) {
      add(applyTemplate(template, trimmed));
    } else {
      const expanded = expandErc1155Uri(trimmed, tokenId);
      if (isNumeric(expanded)) {
        add(applyTemplate(template, expanded));
      } else {
        add(normalizeToHttp(expanded));
      }
    }
  }

  add(applyTemplate(template, tokenIdDec));
  if (defaultTemplate !== template) {
    add(applyTemplate(defaultTemplate, tokenIdDec));
  }

  return candidates;
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function inferTemplate(url, id) {
  const marker = `/${id}/metadata.json`;
  if (url.includes(marker)) {
    return url.replace(marker, "/{id}/metadata.json");
  }
  if (url.includes(id)) {
    return url.replace(id, "{id}");
  }
  return null;
}

async function callUri(contract, tokenId) {
  const selector = "0x0e89341c";
  const tokenHex = tokenId.toString(16).padStart(64, "0");
  const data = `${selector}${tokenHex}`;
  const result = await rpc("eth_call", [{ to: contract, data }, "latest"]);
  return result;
}

function decodeAbiString(hex) {
  const buf = Buffer.from(hex.replace(/^0x/, ""), "hex");
  const len = Number(BigInt(`0x${buf.subarray(32, 64).toString("hex")}`));
  return buf.subarray(64, 64 + len).toString("utf8");
}

async function main() {
  const base = process.env.SPORTFUN_ATHLETE_METADATA_BASE ?? DEFAULT_BASE;
  const template = buildTemplate(base);
  const defaultTemplate = buildTemplate(DEFAULT_BASE);

  const latestHex = await rpc("eth_blockNumber", []);
  const latest = BigInt(latestHex);
  const fromBlock = latest > BLOCK_LOOKBACK ? latest - BLOCK_LOOKBACK : 0n;

  const transfers = await getRecentTransfers(toHex(fromBlock), toHex(latest));
  const picks = pickTokenIds(transfers?.transfers ?? [], MAX_TOKENS);
  if (!picks.length) {
    console.log("No recent ERC-1155 transfers found for Sport.fun contracts.");
    return;
  }

  const recommendations = new Map();
  const results = [];

  for (const pick of picks) {
    const tokenId = BigInt(pick.tokenId);
    const raw = await callUri(pick.contract, tokenId);
    const uriRaw = decodeAbiString(raw).trim();
    const candidates = buildCandidates({ uriRaw, tokenId, template, defaultTemplate });

    let firstOk = null;
    for (const url of candidates) {
      const payload = await fetchJson(url);
      if (payload) {
        firstOk = url;
        const inferred = inferTemplate(url, uriRaw.match(/^\d+$/) ? uriRaw : tokenId.toString(10));
        if (inferred) {
          recommendations.set(inferred, (recommendations.get(inferred) ?? 0) + 1);
        }
        break;
      }
    }

    results.push({
      contract: pick.contract,
      tokenId: pick.tokenId,
      uriRaw,
      candidates,
      firstOk,
    });
  }

  console.log(JSON.stringify({ template, defaultTemplate, samples: results }, null, 2));

  if (recommendations.size) {
    const best = [...recommendations.entries()].sort((a, b) => b[1] - a[1])[0][0];
    console.log("\nRecommended SPORTFUN_ATHLETE_METADATA_BASE:");
    console.log(`  ${best}`);
  } else {
    console.log("\nRecommended SPORTFUN_ATHLETE_METADATA_BASE:");
    console.log("  (no successful metadata fetches found)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
