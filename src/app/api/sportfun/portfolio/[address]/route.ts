import { NextResponse } from "next/server";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { alchemyRpc } from "@/lib/alchemy";
import { shortenAddress } from "@/lib/format";
import { withCache } from "@/lib/stats/cache";
import { kvEnabled, kvGetJson, kvSetJson, kvSetRaw } from "@/lib/kv";
import {
  decodeAbiParameters,
  decodeFunctionResult,
  decodeEventLog,
  encodeFunctionData,
  isAddress,
  type Hex,
} from "viem";
import {
  BASE_USDC,
  BASE_USDC_DECIMALS,
  DEVPLAYERS_EVENTS_ABI,
  FDFPAIR_READ_ABI,
  FDFPAIR_EVENTS_ABI,
  SPORTFUN_DEV_PLAYERS_CONTRACTS,
  SPORTFUN_ERC1155_CONTRACTS,
  SPORTFUN_FDF_PAIR_CONTRACTS,
  SPORTFUN_TOPICS,
  getSportfunAthleteMetadataDefaults,
  getFdfPairForPlayerToken,
  getPlayerTokenForDevPlayers,
  getPlayerTokenForFdfPair,
  isOneOf,
  toLower,
} from "@/lib/sportfun";
import {
  buildSportfunMetadataCandidates,
  normalizeToHttp,
  resolveSportfunMetadataFromUri,
} from "@/lib/sportfunMetadata";
import {
  getSportfunMetadataCacheEntry,
  isSportfunMetadataFresh,
  setSportfunMetadataCacheEntry,
  type SportfunTokenMetadata,
} from "@/lib/sportfunMetadataCache";
import { getSportfunNameOverride, getSportfunSportLabel } from "@/lib/sportfunNames";
import { getSportfunMarketSnapshot } from "@/lib/sportfunMarket";
import {
  getStoredSportfunPrices,
  tokenPriceMapKey,
  triggerSportfunExternalPricesRefresh,
  upsertStoredSportfunPrices,
} from "@/lib/sportfunPrices";
import {
  getSportfunTournamentTpRowsByAthleteNames,
  normalizeSportfunAthleteName,
  type SportfunTournamentTpLookupRow,
  type SportfunTournamentTpSport,
} from "@/lib/sportfunTournamentTp";

export const runtime = "nodejs";

const paramsSchema = z.object({
  address: z.string().min(1),
});

const querySchema = z.object({
  maxCount: z.string().optional(),
  maxPages: z.string().optional(),
  maxActivity: z.string().optional(),
  activityCursor: z.string().optional(),
  includeTrades: z.string().optional(),
  includePrices: z.string().optional(),
  includeReceipts: z.string().optional(),
  includeUri: z.string().optional(),
  includeMetadata: z.string().optional(),
  metadataLimit: z.coerce.number().int().min(1).max(200).optional(),
  mode: z.enum(["sync", "async"]).optional(),
  jobId: z.string().optional(),
  // Higher caps + best-effort full history scan (may still truncate if it risks timeouts).
  scanMode: z.enum(["default", "full"]).optional(),
});

type AlchemyTransfer = {
  category?: string;
  uniqueId?: string;
  blockNum?: string;
  hash?: string;
  from?: string;
  to?: string;
  erc721TokenId?: string;
  metadata?: { blockTimestamp?: string };
  rawContract?: {
    address?: string;
    // For ERC-20 this is typically a hex string of base units.
    value?: string;
    decimal?: string;
  };
  erc1155Metadata?: Array<{ tokenId: string; value: string }>;
};

type TxReceiptLog = {
  address: string;
  topics: Hex[];
  data: Hex;
  blockNumber?: Hex;
  transactionHash?: Hex;
  logIndex?: Hex;
};

const ERC20_TRANSFER_TOPIC0 =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const SCAN_START_DATE_ISO =
  process.env.SPORTFUN_SCAN_START_DATE_ISO?.trim() || "2024-01-01T00:00:00Z";
const SCAN_START_BLOCK_BUFFER = 500n;
const SCAN_START_BLOCK_FALLBACK_HEX =
  process.env.SPORTFUN_SCAN_START_BLOCK_FALLBACK_HEX?.trim() || "0x0";
const scanStartLookupTimeoutMsEnv = Number(process.env.SPORTFUN_SCAN_START_BLOCK_LOOKUP_TIMEOUT_MS ?? "8000");
const SCAN_START_BLOCK_LOOKUP_TIMEOUT_MS =
  Number.isFinite(scanStartLookupTimeoutMsEnv) && scanStartLookupTimeoutMsEnv > 0
    ? Math.trunc(scanStartLookupTimeoutMsEnv)
    : 8000;
const CONTRACT_RENEWAL_LOGS_CACHE_TTL_MS = 1000 * 60 * 10; // 10m
const TX_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const PORTFOLIO_CACHE_SCHEMA_VERSION = 12;
const SPORTFUN_FUN_TOKEN_ADDRESS = "0x16ee7ecac70d1028e7712751e2ee6ba808a7dd92";
const PACK_OPEN_SELECTORS = new Set<string>([
  // Legacy pack open flow (observed on 2025-10/11 transactions).
  "0x4cd9acce",
  // openPlayerPackV2(address,uint256[],uint256[],uint256)
  "0xad3a4b08",
]);
const DEFAULT_SPORTFUN_DEPOSIT_COUNTERPARTIES = [
  // Sport.fun in-game wallet counterparty observed in deposit/withdraw flows.
  "0x3aa295bb3f19b9999995e3fa04d6b7ef6ce3850c",
] as const;

function getSportfunDepositCounterparties(): Set<string> {
  const set = new Set<string>([...DEFAULT_SPORTFUN_DEPOSIT_COUNTERPARTIES].map((x) => x.toLowerCase()));
  const raw = process.env.SPORTFUN_DEPOSIT_COUNTERPARTIES;
  if (!raw) return set;
  for (const token of raw.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean)) {
    if (!isAddress(token)) continue;
    set.add(token.toLowerCase());
  }
  return set;
}

const CONTRACT_RENEWAL_EVENTS_ABI = [
  {
    type: "event",
    name: "ContractRenewed",
    inputs: [
      { name: "account", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "paymentToken", type: "address", indexed: true },
      { name: "amountPaid", type: "uint256", indexed: false },
      { name: "matchCount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;

type DecodedContractRenewalItem = {
  kind: "contract_renewal";
  renewalContract: string;
  account: string;
  tokenIdDec: string;
  paymentToken: string;
  amountPaidRaw: string;
  matchCountRaw: string;
  playerToken?: string;
  txHash?: string;
  blockNumber?: string;
};

type DecodedPackOpenItem = {
  kind: "pack_open";
  packContract?: string;
  opener?: string;
  selector?: string;
  playerToken: string;
  tokenIdDec: string;
  shareAmountRaw: string;
  walletCurrencyDeltaRaw?: string;
  walletCurrencyDeltaSource?: "receipt_reconciled";
};

type DecodedDepositItem = {
  kind: "deposit";
  direction: "to_game_wallet" | "from_game_wallet";
  counterparty: string;
  amountRaw: string;
  paymentToken: string;
};

type DecodedScamItem = {
  kind: "scam";
  category: "erc20" | "erc721" | "erc1155";
  counterparty: string;
  contractAddress?: string;
  tokenIdHex?: string;
  tokenIdDec?: string;
  amountRaw?: string;
  reason: "unsupported_game_wallet_asset" | "unsupported_wallet_asset";
};

type ContractRenewalLogsCache = {
  version: number;
  address: string;
  fromBlock: string;
  updatedAt: number;
  renewals: DecodedContractRenewalItem[];
};

const CONTRACT_RENEWAL_LOGS_CACHE_VERSION = 1;

function invalidAddressResponse(address: string) {
  return NextResponse.json(
    {
      error: "invalid_address",
      message: `Invalid EVM address: ${address}`,
    },
    { status: 400 }
  );
}

function topicToAddressLc(topic: Hex | undefined): string {
  const t = String(topic ?? "0x").toLowerCase().replace(/^0x/, "");
  // topics encode indexed addresses as 32-byte values; take the last 20 bytes.
  return `0x${t.slice(-40)}`;
}

function toHex(value: bigint): Hex {
  return `0x${value.toString(16)}` as Hex;
}

async function getLatestBlock(): Promise<bigint> {
  const result = await alchemyRpc("eth_blockNumber", []);
  return BigInt(result);
}

async function getBlockTimestampMs(blockNumber: bigint): Promise<number> {
  const block = await alchemyRpc("eth_getBlockByNumber", [toHex(blockNumber), false]);
  const ts = Number(BigInt(block.timestamp));
  return ts * 1000;
}

async function findBlockByTimestamp(targetMs: number): Promise<bigint> {
  const latest = await getLatestBlock();
  let low = 0n;
  let high = latest;
  let iter = 0;
  while (low + 1n < high && iter < 40) {
    iter += 1;
    const mid = (low + high) / 2n;
    const ts = await getBlockTimestampMs(mid);
    if (ts < targetMs) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return high;
}

async function getScanStartBlockHex(): Promise<string> {
  const targetMs = Date.parse(SCAN_START_DATE_ISO);
  if (!Number.isFinite(targetMs)) return SCAN_START_BLOCK_FALLBACK_HEX;

  const lookupPromise = withCache(
    `sportfun:scan-start-block:${SCAN_START_DATE_ISO}`,
    60 * 60 * 24 * 30,
    async () => (await findBlockByTimestamp(targetMs)).toString(10)
  ).catch(() => null);

  const timeoutPromise = new Promise<string | null>((resolve) => {
    setTimeout(() => resolve(null), SCAN_START_BLOCK_LOOKUP_TIMEOUT_MS);
  });

  const blockStr = await Promise.race([lookupPromise, timeoutPromise]);
  if (!blockStr) return SCAN_START_BLOCK_FALLBACK_HEX;

  let block = BigInt(blockStr);
  if (block > SCAN_START_BLOCK_BUFFER) block -= SCAN_START_BLOCK_BUFFER;
  return toHex(block);
}

function decodeErc20DeltaFromReceipt(params: {
  receipt: TxReceipt;
  tokenAddressLc: string;
  walletLc: string;
}): bigint | null {
  const logs = params.receipt.logs ?? [];
  let found = false;
  let delta = 0n;

  for (const log of logs) {
    const addrLc = toLower(log.address);
    if (addrLc !== params.tokenAddressLc) continue;

    const topic0 = String(log.topics?.[0] ?? "").toLowerCase();
    if (topic0 !== ERC20_TRANSFER_TOPIC0) continue;

    // topic0 + from + to
    if ((log.topics?.length ?? 0) < 3) continue;

    found = true;
    const fromLc = topicToAddressLc(log.topics[1]);
    const toLc = topicToAddressLc(log.topics[2]);
    const value = parseBigIntish(log.data);

    if (toLc === params.walletLc) delta += value;
    if (fromLc === params.walletLc) delta -= value;
  }

  return found ? delta : null;
}


type TxReceipt = {
  transactionHash: Hex;
  blockNumber?: Hex;
  logs?: TxReceiptLog[];
};

type TxByHash = {
  hash: Hex;
  from: Hex;
  to?: Hex;
  input: Hex;
  blockNumber?: Hex;
};

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


function parseBool(v: string | undefined, defaultValue: boolean): boolean {
  if (v === undefined) return defaultValue;
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return defaultValue;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  let i = 0;

  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]);
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    () => worker()
  );
  await Promise.all(workers);
  return out;
}

async function withRetry<T>(fn: () => Promise<T>, opts?: { retries?: number; baseDelayMs?: number }): Promise<T> {
  const retries = opts?.retries ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 250;

  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const waitMs = baseDelayMs * 2 ** attempt;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

type TransfersPageResult = {
  transfers: AlchemyTransfer[];
  nextPageKey?: string;
  pagesFetched: number;
  truncatedByBudget: boolean;
  sync?: {
    fromBlockRequested: string;
    fromBlockFetched: string;
    lastSyncedBlock?: string;
    historyBackfilled: boolean;
    usedIncremental: boolean;
    lastQueryAt: string;
  };
};

const TRANSFERS_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days (stable historical pages)
const TRANSFERS_CACHE_HEAD_TTL_MS = 1000 * 30; // 30s (head page changes as new blocks arrive)
const TRANSFERS_HISTORY_SCHEMA_VERSION = 1;

function sha1Hex(s: string): string {
  return crypto.createHash("sha1").update(s).digest("hex");
}

function addressTopic(address: string): Hex {
  const hex = address.toLowerCase().replace(/^0x/, "");
  return `0x${hex.padStart(64, "0")}` as Hex;
}

function contractRenewalLogsCachePath(params: { address: string; fromBlock: string }): string {
  const addr = params.address.toLowerCase();
  const fromBlock = normalizeBlockHex(params.fromBlock);
  const key = sha1Hex(`${addr}:${fromBlock}`);
  return path.join(process.cwd(), ".cache", "sportfun", "renewals", `${key}.json`);
}

function readContractRenewalLogsCache(pathname: string): ContractRenewalLogsCache | null {
  try {
    const txt = fs.readFileSync(pathname, "utf8");
    const parsed = JSON.parse(txt) as ContractRenewalLogsCache;
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.renewals)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeContractRenewalLogsCache(pathname: string, payload: ContractRenewalLogsCache): void {
  try {
    fs.mkdirSync(path.dirname(pathname), { recursive: true });
    fs.writeFileSync(pathname, JSON.stringify(payload), "utf8");
  } catch {
    // ignore
  }
}

function decodeContractRenewalLog(params: {
  log: TxReceiptLog;
  walletLc: string;
}): DecodedContractRenewalItem | null {
  const topic0 = toLower(String(params.log.topics?.[0] ?? ""));
  if (topic0 !== SPORTFUN_TOPICS.ContractRenewed) return null;

  try {
    const decoded = decodeEventLog({
      abi: CONTRACT_RENEWAL_EVENTS_ABI,
      data: params.log.data,
      topics: params.log.topics as [Hex, ...Hex[]],
    });

    if (!decoded.args) return null;
    if (decoded.eventName !== "ContractRenewed") return null;

    const account = toLower(String(decoded.args.account));
    if (account !== params.walletLc) return null;

    return {
      kind: "contract_renewal",
      renewalContract: toLower(params.log.address),
      account,
      tokenIdDec: BigInt(decoded.args.tokenId as bigint).toString(10),
      paymentToken: toLower(String(decoded.args.paymentToken)),
      amountPaidRaw: BigInt(decoded.args.amountPaid as bigint).toString(10),
      matchCountRaw: BigInt(decoded.args.matchCount as bigint).toString(10),
      txHash: params.log.transactionHash ? toLower(String(params.log.transactionHash)) : undefined,
      blockNumber: params.log.blockNumber ? normalizeBlockHex(String(params.log.blockNumber)) : undefined,
    };
  } catch {
    // Some renewal contracts emit the same topic with a slightly different ABI shape.
    // Fallback to manual decoding by raw topics/data:
    // topic1=account, topic2=tokenId, topic3=paymentToken, data[0]=amountPaid, data[1]=matchCount.
    try {
      const topics = params.log.topics ?? [];
      if (topics.length < 4) return null;

      const account = topicToAddressLc(topics[1]);
      if (account !== params.walletLc) return null;

      const tokenIdDec = parseBigIntish(String(topics[2])).toString(10);
      const paymentToken = topicToAddressLc(topics[3]);

      const dataHex = String(params.log.data ?? "0x").replace(/^0x/, "");
      if (dataHex.length < 128) return null;
      const amountPaidRaw = parseBigIntish(`0x${dataHex.slice(0, 64)}`).toString(10);
      const matchCountRaw = parseBigIntish(`0x${dataHex.slice(64, 128)}`).toString(10);

      return {
        kind: "contract_renewal",
        renewalContract: toLower(params.log.address),
        account,
        tokenIdDec,
        paymentToken,
        amountPaidRaw,
        matchCountRaw,
        txHash: params.log.transactionHash ? toLower(String(params.log.transactionHash)) : undefined,
        blockNumber: params.log.blockNumber ? normalizeBlockHex(String(params.log.blockNumber)) : undefined,
      };
    } catch {
      return null;
    }
  }
}

function dedupeContractRenewals(items: DecodedContractRenewalItem[]): DecodedContractRenewalItem[] {
  const byId = new Map<string, DecodedContractRenewalItem>();
  for (const item of items) {
    const id = [
      item.txHash ?? "",
      item.renewalContract,
      item.account,
      item.tokenIdDec,
      item.paymentToken,
      item.amountPaidRaw,
      item.matchCountRaw,
    ].join(":");
    if (!byId.has(id)) byId.set(id, item);
  }
  return [...byId.values()];
}

async function fetchContractRenewalLogs(params: {
  wallet: string;
  fromBlock: string;
  toBlock?: string;
}): Promise<TxReceiptLog[]> {
  const result = (await alchemyRpc("eth_getLogs", [
    {
      fromBlock: normalizeBlockHex(params.fromBlock),
      toBlock: params.toBlock ?? "latest",
      topics: [SPORTFUN_TOPICS.ContractRenewed, addressTopic(params.wallet)],
    },
  ])) as Array<{
    address: string;
    topics: string[];
    data: string;
    blockNumber?: string;
    transactionHash?: string;
    logIndex?: string;
  }>;

  return (result ?? []).map((log) => ({
    address: log.address,
    topics: (log.topics ?? []) as Hex[],
    data: (log.data ?? "0x") as Hex,
    blockNumber: log.blockNumber as Hex | undefined,
    transactionHash: log.transactionHash as Hex | undefined,
    logIndex: log.logIndex as Hex | undefined,
  }));
}

async function fetchContractRenewalsForWallet(params: {
  wallet: string;
  walletLc: string;
  fromBlock: string;
  deadlineMs?: number;
}): Promise<DecodedContractRenewalItem[]> {
  const fromBlock = normalizeBlockHex(params.fromBlock);
  const cachePath = contractRenewalLogsCachePath({ address: params.wallet, fromBlock });
  const cached = readContractRenewalLogsCache(cachePath);
  const now = Date.now();

  if (
    cached &&
    cached.version === CONTRACT_RENEWAL_LOGS_CACHE_VERSION &&
    cached.address.toLowerCase() === params.walletLc &&
    normalizeBlockHex(cached.fromBlock) === fromBlock &&
    now - cached.updatedAt < CONTRACT_RENEWAL_LOGS_CACHE_TTL_MS
  ) {
    return dedupeContractRenewals(cached.renewals ?? []);
  }

  let logs: TxReceiptLog[] = [];
  try {
    logs = await withRetry(
      () => fetchContractRenewalLogs({ wallet: params.wallet, fromBlock }),
      { retries: 2, baseDelayMs: 200 }
    );
  } catch {
    // Fallback for providers that reject wide `eth_getLogs` ranges.
    try {
      const latestBlock = BigInt(await alchemyRpc("eth_blockNumber", []));
      const startBlock = BigInt(fromBlock);
      const step = 500_000n;
      const out: TxReceiptLog[] = [];
      for (let from = startBlock; from <= latestBlock; from += step + 1n) {
        if (params.deadlineMs !== undefined && Date.now() > params.deadlineMs - 500) break;
        const to = from + step > latestBlock ? latestBlock : from + step;
        const chunkLogs = await fetchContractRenewalLogs({
          wallet: params.wallet,
          fromBlock: toHex(from),
          toBlock: toHex(to),
        });
        out.push(...chunkLogs);
      }
      logs = out;
    } catch {
      logs = [];
    }
  }

  const renewals = dedupeContractRenewals(
    logs
      .map((log) => decodeContractRenewalLog({ log, walletLc: params.walletLc }))
      .filter((item): item is DecodedContractRenewalItem => Boolean(item))
  );

  writeContractRenewalLogsCache(cachePath, {
    version: CONTRACT_RENEWAL_LOGS_CACHE_VERSION,
    address: params.walletLc,
    fromBlock,
    updatedAt: now,
    renewals,
  });

  return renewals;
}

function contractAddressesCacheKey(contractAddresses?: string[]): string {
  if (!contractAddresses?.length) return "all";
  return sha1Hex([...contractAddresses].map((x) => x.toLowerCase()).sort().join(","));
}

function normalizeBlockHex(block: string | undefined): string {
  if (!block) return "0x0";
  try {
    return toHex(parseBigIntish(block));
  } catch {
    return "0x0";
  }
}

function getTransferBlockNum(transfer: AlchemyTransfer): bigint | null {
  const blockNum = transfer.blockNum;
  if (!blockNum) return null;
  try {
    return parseBigIntish(blockNum);
  } catch {
    return null;
  }
}

function getMaxTransferBlockNum(transfers: AlchemyTransfer[]): bigint | null {
  let max: bigint | null = null;
  for (const transfer of transfers) {
    const blockNum = getTransferBlockNum(transfer);
    if (blockNum === null) continue;
    if (max === null || blockNum > max) max = blockNum;
  }
  return max;
}

function transfersCachePath(params: {
  address: string;
  direction: "incoming" | "outgoing";
  category: "erc1155" | "erc20" | "erc721";
  contractAddresses?: string[];
  counterpartyAddress?: string;
  fromBlock: string;
  order: "asc" | "desc";
  maxCount: string;
  pageKey?: string;
}): string {
  const addr = params.address.toLowerCase();
  const contractKey = contractAddressesCacheKey(params.contractAddresses);
  const counterpartyKey = params.counterpartyAddress
    ? params.counterpartyAddress.toLowerCase()
    : "any-counterparty";
  const fromBlockKey = normalizeBlockHex(params.fromBlock);
  const requestShapeKey = sha1Hex(`${fromBlockKey}:${params.order}:${params.maxCount}`);
  const pageKeyHash = sha1Hex(params.pageKey ?? "first");

  return path.join(
    process.cwd(),
    ".cache",
    "sportfun",
    "transfers",
    addr,
    params.category,
    params.direction,
    counterpartyKey,
    contractKey,
    requestShapeKey,
    `${pageKeyHash}.json`
  );
}

type TransfersHistoryCache = {
  version: number;
  address: string;
  direction: "incoming" | "outgoing";
  category: "erc1155" | "erc20" | "erc721";
  contractKey: string;
  counterpartyKey: string;
  fromBlock: string;
  updatedAt: number;
  lastQueryAt: string;
  isFullyBackfilled: boolean;
  lastSyncedBlock?: string;
  transfers: AlchemyTransfer[];
};

function transfersHistoryPath(params: {
  address: string;
  direction: "incoming" | "outgoing";
  category: "erc1155" | "erc20" | "erc721";
  contractAddresses?: string[];
  counterpartyAddress?: string;
}): string {
  const addr = params.address.toLowerCase();
  const contractKey = contractAddressesCacheKey(params.contractAddresses);
  const counterpartyKey = params.counterpartyAddress
    ? params.counterpartyAddress.toLowerCase()
    : "any-counterparty";
  return path.join(
    process.cwd(),
    ".cache",
    "sportfun",
    "history",
    addr,
    params.category,
    params.direction,
    counterpartyKey,
    `${contractKey}.json`
  );
}

function readTransfersHistory(pathname: string): TransfersHistoryCache | null {
  try {
    const txt = fs.readFileSync(pathname, "utf8");
    const parsed = JSON.parse(txt) as TransfersHistoryCache;
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.transfers)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeTransfersHistory(pathname: string, cache: TransfersHistoryCache): void {
  try {
    fs.mkdirSync(path.dirname(pathname), { recursive: true });
    fs.writeFileSync(pathname, JSON.stringify(cache), "utf8");
  } catch {
    // ignore
  }
}

async function fetchTransfersPagesFromAlchemy(params: {
  address: string;
  direction: "incoming" | "outgoing";
  category: "erc1155" | "erc20" | "erc721";
  contractAddresses?: string[];
  counterpartyAddress?: string;
  maxCount: string;
  maxPages: number;
  deadlineMs?: number;
  fromBlock?: string;
  order?: "asc" | "desc";
}): Promise<TransfersPageResult> {
  const baseParams: {
    fromBlock: string;
    toBlock: "latest";
    category: ["erc1155"] | ["erc20"] | ["erc721"];
    withMetadata: true;
    maxCount: string;
    order: "asc" | "desc";
    contractAddresses?: string[];
  } = {
    fromBlock: params.fromBlock ?? "0x0",
    toBlock: "latest",
    category: [params.category],
    withMetadata: true,
    maxCount: params.maxCount,
    order: params.order ?? "desc",
    ...(params.contractAddresses ? { contractAddresses: params.contractAddresses } : {}),
  };

  let pageKey: string | undefined;
  const all: AlchemyTransfer[] = [];
  let pagesFetched = 0;
  let truncatedByBudget = false;

  for (let page = 0; page < params.maxPages; page++) {
    if (params.deadlineMs !== undefined && Date.now() > params.deadlineMs) {
      truncatedByBudget = true;
      break;
    }

    // Best-effort cache for transfer pages.
    const cacheP = transfersCachePath({
      address: params.address,
      direction: params.direction,
      category: params.category,
      contractAddresses: params.contractAddresses,
      counterpartyAddress: params.counterpartyAddress,
      fromBlock: baseParams.fromBlock,
      order: baseParams.order,
      maxCount: baseParams.maxCount,
      pageKey,
    });

    let result: { transfers?: AlchemyTransfer[]; pageKey?: string } | null = null;

    try {
      const st = fs.statSync(cacheP);
      const ageMs = Date.now() - st.mtimeMs;
      const cacheTtlMs = pageKey ? TRANSFERS_CACHE_TTL_MS : TRANSFERS_CACHE_HEAD_TTL_MS;
      if (ageMs < cacheTtlMs) {
        const txt = fs.readFileSync(cacheP, "utf8");
        result = JSON.parse(txt) as { transfers?: AlchemyTransfer[]; pageKey?: string };
      }
    } catch {
      // ignore
    }

    if (!result) {
      result = (await withRetry(
        () =>
          alchemyRpc("alchemy_getAssetTransfers", [
            {
              ...baseParams,
              ...(params.direction === "incoming"
                ? {
                    toAddress: params.address,
                    ...(params.counterpartyAddress
                      ? { fromAddress: params.counterpartyAddress }
                      : {}),
                  }
                : {
                    fromAddress: params.address,
                    ...(params.counterpartyAddress ? { toAddress: params.counterpartyAddress } : {}),
                  }),
              ...(pageKey ? { pageKey } : {}),
            },
          ]),
        { retries: 3 }
      )) as { transfers?: AlchemyTransfer[]; pageKey?: string };

      try {
        fs.mkdirSync(path.dirname(cacheP), { recursive: true });
        fs.writeFileSync(cacheP, JSON.stringify(result), "utf8");
      } catch {
        // ignore
      }
    }

    const transfers = result.transfers ?? [];
    all.push(...transfers);
    pagesFetched++;

    pageKey = result.pageKey;
    if (!pageKey) break;
  }

  return {
    transfers: all,
    nextPageKey: pageKey,
    pagesFetched,
    truncatedByBudget,
  };
}

async function fetchTransfersForWallet(params: {
  address: string;
  direction: "incoming" | "outgoing";
  category: "erc1155" | "erc20" | "erc721";
  contractAddresses?: string[];
  counterpartyAddress?: string;
  maxCount: string;
  maxPages: number;
  deadlineMs?: number;
  fromBlock?: string;
}): Promise<TransfersPageResult> {
  const requestedFromBlock = normalizeBlockHex(params.fromBlock ?? "0x0");
  const historyPath = transfersHistoryPath({
    address: params.address,
    direction: params.direction,
    category: params.category,
    contractAddresses: params.contractAddresses,
    counterpartyAddress: params.counterpartyAddress,
  });
  const contractKey = contractAddressesCacheKey(params.contractAddresses);
  const counterpartyKey = params.counterpartyAddress
    ? params.counterpartyAddress.toLowerCase()
    : "any-counterparty";
  const nowIso = new Date().toISOString();

  const history = readTransfersHistory(historyPath);
  const historyMatchesRequest =
    history?.version === TRANSFERS_HISTORY_SCHEMA_VERSION &&
    history?.address?.toLowerCase() === params.address.toLowerCase() &&
    history?.direction === params.direction &&
    history?.category === params.category &&
    history?.contractKey === contractKey &&
    history?.counterpartyKey === counterpartyKey &&
    normalizeBlockHex(history?.fromBlock) === requestedFromBlock;

  const seededTransfers = historyMatchesRequest ? history?.transfers ?? [] : [];
  const historyBackfilled = Boolean(historyMatchesRequest && history?.isFullyBackfilled);

  let usedIncremental = false;
  let fromBlockFetched = requestedFromBlock;
  if (historyBackfilled && history?.lastSyncedBlock) {
    try {
      fromBlockFetched = toHex(BigInt(history.lastSyncedBlock) + 1n);
      usedIncremental = true;
    } catch {
      fromBlockFetched = requestedFromBlock;
      usedIncremental = false;
    }
  }

  const fetched = await fetchTransfersPagesFromAlchemy({
    ...params,
    fromBlock: fromBlockFetched,
    // Incremental mode must be ascending so we can safely advance the watermark
    // even when the query is paginated or time-bounded.
    order: usedIncremental ? "asc" : "desc",
  });

  const transfers = dedupeTransfers([...seededTransfers, ...fetched.transfers]);

  let nextHistoryBackfilled = historyBackfilled;
  if (!historyBackfilled && !fetched.nextPageKey && !fetched.truncatedByBudget) {
    nextHistoryBackfilled = true;
  }

  const fetchedMaxBlock = getMaxTransferBlockNum(fetched.transfers);
  const mergedMaxBlock = getMaxTransferBlockNum(transfers);
  let lastSyncedBlock = historyMatchesRequest ? history?.lastSyncedBlock : undefined;

  if (nextHistoryBackfilled) {
    if (usedIncremental) {
      if (fetchedMaxBlock !== null) lastSyncedBlock = toHex(fetchedMaxBlock);
    } else if (mergedMaxBlock !== null) {
      lastSyncedBlock = toHex(mergedMaxBlock);
    }
  }

  const historyPayload: TransfersHistoryCache = {
    version: TRANSFERS_HISTORY_SCHEMA_VERSION,
    address: params.address.toLowerCase(),
    direction: params.direction,
    category: params.category,
    contractKey,
    counterpartyKey,
    fromBlock: requestedFromBlock,
    updatedAt: Date.now(),
    lastQueryAt: nowIso,
    isFullyBackfilled: nextHistoryBackfilled,
    lastSyncedBlock,
    transfers,
  };
  writeTransfersHistory(historyPath, historyPayload);

  return {
    ...fetched,
    transfers,
    sync: {
      fromBlockRequested: requestedFromBlock,
      fromBlockFetched,
      lastSyncedBlock,
      historyBackfilled: nextHistoryBackfilled,
      usedIncremental,
      lastQueryAt: nowIso,
    },
  };
}

function dedupeTransfers(transfers: AlchemyTransfer[]): AlchemyTransfer[] {
  const byId = new Map<string, AlchemyTransfer>();
  for (const t of transfers) {
    const id =
      t.uniqueId ??
      `${t.hash ?? ""}:${t.blockNum ?? ""}:${t.from ?? ""}:${t.to ?? ""}:${t.category ?? ""}:${t.rawContract?.address ?? ""}:${t.rawContract?.value ?? ""}`;
    if (!byId.has(id)) byId.set(id, t);
  }
  return [...byId.values()];
}

const RECEIPT_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

type TokenMetadata = {
  name?: string;
  description?: string;
  image?: string;
  imageUrl?: string;
};

function toTokenMetadata(meta: SportfunTokenMetadata | null | undefined): TokenMetadata | undefined {
  if (!meta) return undefined;
  const image = meta.image;
  const imageUrl = image ? normalizeToHttp(image) : undefined;
  return {
    name: meta.name,
    description: meta.description,
    image,
    imageUrl,
  };
}

type MetadataCacheValue = {
  uri: string;
  template?: string;
  metadata?: TokenMetadata;
  error?: string;
};

const METADATA_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const DECODED_CACHE_SCHEMA_VERSION = 3;

function getMetadataCacheMap(): Map<string, { value: MetadataCacheValue; expiresAt: number }> {
  const g = globalThis as unknown as {
    __pff_sportfun_metadataCache?: Map<string, { value: MetadataCacheValue; expiresAt: number }>;
  };
  if (!g.__pff_sportfun_metadataCache) g.__pff_sportfun_metadataCache = new Map();
  return g.__pff_sportfun_metadataCache;
}

function metadataCachePath(key: string): string {
  const safe = sha1Hex(key);
  return path.join(process.cwd(), ".cache", "sportfun", "metadata", `${safe}.json`);
}

function readMetadataCache(key: string): MetadataCacheValue | null {
  const mem = getMetadataCacheMap();
  const now = Date.now();
  const cached = mem.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const p = metadataCachePath(key);
    const st = fs.statSync(p);
    const ageMs = now - st.mtimeMs;
    if (ageMs < METADATA_CACHE_TTL_MS) {
      const txt = fs.readFileSync(p, "utf8");
      const parsed = JSON.parse(txt) as MetadataCacheValue;
      mem.set(key, { value: parsed, expiresAt: now + METADATA_CACHE_TTL_MS });
      return parsed;
    }
  } catch {
    // ignore
  }

  return null;
}

function writeMetadataCache(key: string, value: MetadataCacheValue): void {
  const mem = getMetadataCacheMap();
  const now = Date.now();
  mem.set(key, { value, expiresAt: now + METADATA_CACHE_TTL_MS });

  try {
    const p = metadataCachePath(key);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(value), "utf8");
  } catch {
    // ignore
  }
}

async function resolveMetadataForToken(params: {
  uri: string;
  tokenId: bigint;
  template: string;
  defaultTemplate: string;
}): Promise<{ metadata?: TokenMetadata; resolvedUri?: string; error?: string }> {
  const resolved = await resolveSportfunMetadataFromUri({
    uriRaw: params.uri,
    tokenId: params.tokenId,
    template: params.template,
    defaultTemplate: params.defaultTemplate,
    revalidateSeconds: 60 * 60,
  });
  return {
    metadata: toTokenMetadata(resolved.metadata),
    resolvedUri: resolved.resolvedUri ?? params.uri,
    error: resolved.error,
  };
}

function getReceiptCacheMap(): Map<string, { value: TxReceipt | null; expiresAt: number }> {
  const g = globalThis as unknown as {
    __pff_sportfun_receiptCache?: Map<string, { value: TxReceipt | null; expiresAt: number }>;
  };
  if (!g.__pff_sportfun_receiptCache) g.__pff_sportfun_receiptCache = new Map();
  return g.__pff_sportfun_receiptCache;
}

function receiptCachePath(txHash: string): string {
  const safe = txHash.toLowerCase().replace(/^0x/, "");
  return path.join(process.cwd(), ".cache", "sportfun", "receipts", `${safe}.json`);
}

type ReceiptDecodedCache = {
  version: number;
  decoded: {
    trades: DecodedTradeItem[];
    promotions: DecodedPromotionItem[];
    contractRenewals: DecodedContractRenewalItem[];
    packOpens: DecodedPackOpenItem[];
    deposits: DecodedDepositItem[];
    scams: DecodedScamItem[];
    unknownSportfunTopics: Array<{ address: string; topic0: string }>;
  };
  usdcDeltaReceipt: string | null;
};

function getDecodedCacheMap(): Map<string, { value: ReceiptDecodedCache; expiresAt: number }> {
  const g = globalThis as unknown as {
    __pff_sportfun_decodedCache?: Map<string, { value: ReceiptDecodedCache; expiresAt: number }>;
  };
  if (!g.__pff_sportfun_decodedCache) g.__pff_sportfun_decodedCache = new Map();
  return g.__pff_sportfun_decodedCache;
}

function decodedCachePath(txHash: string): string {
  const safe = txHash.toLowerCase().replace(/^0x/, "");
  return path.join(process.cwd(), ".cache", "sportfun", "decoded", `${safe}.json`);
}

function normalizeDecodedCacheValue(value: ReceiptDecodedCache | null): ReceiptDecodedCache | null {
  if (!value || typeof value !== "object") return null;
  if (value.version !== DECODED_CACHE_SCHEMA_VERSION) return null;
  if (!value?.decoded || typeof value.decoded !== "object") return null;
  if (!Array.isArray(value.decoded.trades)) value.decoded.trades = [];
  if (!Array.isArray(value.decoded.promotions)) value.decoded.promotions = [];
  if (!Array.isArray(value.decoded.contractRenewals)) value.decoded.contractRenewals = [];
  if (!Array.isArray(value.decoded.packOpens)) value.decoded.packOpens = [];
  if (!Array.isArray(value.decoded.deposits)) value.decoded.deposits = [];
  if (!Array.isArray(value.decoded.scams)) value.decoded.scams = [];
  if (!Array.isArray(value.decoded.unknownSportfunTopics)) value.decoded.unknownSportfunTopics = [];
  if (value.usdcDeltaReceipt !== null && typeof value.usdcDeltaReceipt !== "string") {
    value.usdcDeltaReceipt = null;
  }
  return value;
}

function readDecodedCache(txHash: string): ReceiptDecodedCache | null {
  const key = txHash.toLowerCase();
  const mem = getDecodedCacheMap();
  const now = Date.now();

  const cached = mem.get(key);
  if (cached && cached.expiresAt > now) {
    const normalized = normalizeDecodedCacheValue(cached.value);
    if (normalized) return normalized;
    mem.delete(key);
  }

  try {
    const p = decodedCachePath(key);
    const st = fs.statSync(p);
    const ageMs = now - st.mtimeMs;
    if (ageMs < RECEIPT_CACHE_TTL_MS) {
      const txt = fs.readFileSync(p, "utf8");
      const parsed = JSON.parse(txt) as ReceiptDecodedCache;
      const normalized = normalizeDecodedCacheValue(parsed);
      if (!normalized) return null;
      mem.set(key, { value: normalized, expiresAt: now + RECEIPT_CACHE_TTL_MS });
      return normalized;
    }
  } catch {
    // ignore
  }

  return null;
}

function writeDecodedCache(txHash: string, value: ReceiptDecodedCache): void {
  const key = txHash.toLowerCase();
  const normalized = normalizeDecodedCacheValue(value);
  if (!normalized) return;
  const mem = getDecodedCacheMap();
  const now = Date.now();
  mem.set(key, { value: normalized, expiresAt: now + RECEIPT_CACHE_TTL_MS });

  try {
    const p = decodedCachePath(key);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(normalized), "utf8");
  } catch {
    // ignore
  }
}

async function fetchReceipt(txHash: string): Promise<TxReceipt | null> {
  const key = txHash.toLowerCase();
  const mem = getReceiptCacheMap();
  const now = Date.now();

  const cached = mem.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  // Best-effort disk cache (works great on a VPS; may be ephemeral on serverless).
  try {
    const p = receiptCachePath(key);
    const st = fs.statSync(p);
    const ageMs = now - st.mtimeMs;
    if (ageMs < RECEIPT_CACHE_TTL_MS) {
      const txt = fs.readFileSync(p, "utf8");
      const parsed = JSON.parse(txt) as TxReceipt | null;
      mem.set(key, { value: parsed, expiresAt: now + RECEIPT_CACHE_TTL_MS });
      return parsed;
    }
  } catch {
    // ignore
  }

  try {
    const receipt = (await withRetry(
      () => alchemyRpc("eth_getTransactionReceipt", [txHash]),
      { retries: 3, baseDelayMs: 250 }
    )) as TxReceipt | null;

    mem.set(key, { value: receipt, expiresAt: now + RECEIPT_CACHE_TTL_MS });

    try {
      const p = receiptCachePath(key);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(receipt), "utf8");
    } catch {
      // ignore
    }

    return receipt;
  } catch {
    mem.set(key, { value: null, expiresAt: now + 1000 * 60 * 10 }); // negative cache 10m
    return null;
  }
}

function getTxCacheMap(): Map<string, { value: TxByHash | null; expiresAt: number }> {
  const g = globalThis as unknown as {
    __pff_sportfun_txCache?: Map<string, { value: TxByHash | null; expiresAt: number }>;
  };
  if (!g.__pff_sportfun_txCache) g.__pff_sportfun_txCache = new Map();
  return g.__pff_sportfun_txCache;
}

function txCachePath(txHash: string): string {
  const safe = txHash.toLowerCase().replace(/^0x/, "");
  return path.join(process.cwd(), ".cache", "sportfun", "tx", `${safe}.json`);
}

function normalizeTxByHash(tx: TxByHash | null): TxByHash | null {
  if (!tx) return null;
  if (typeof tx.input !== "string" || !tx.input.startsWith("0x")) return null;
  return tx;
}

async function fetchTransaction(txHash: string): Promise<TxByHash | null> {
  const key = txHash.toLowerCase();
  const mem = getTxCacheMap();
  const now = Date.now();

  const cached = mem.get(key);
  if (cached && cached.expiresAt > now) return normalizeTxByHash(cached.value);

  try {
    const p = txCachePath(key);
    const st = fs.statSync(p);
    const ageMs = now - st.mtimeMs;
    if (ageMs < TX_CACHE_TTL_MS) {
      const txt = fs.readFileSync(p, "utf8");
      const parsed = normalizeTxByHash(JSON.parse(txt) as TxByHash | null);
      mem.set(key, { value: parsed, expiresAt: now + TX_CACHE_TTL_MS });
      return parsed;
    }
  } catch {
    // ignore
  }

  try {
    const tx = normalizeTxByHash(
      (await withRetry(() => alchemyRpc("eth_getTransactionByHash", [txHash]), {
        retries: 2,
        baseDelayMs: 200,
      })) as TxByHash | null
    );

    mem.set(key, { value: tx, expiresAt: now + TX_CACHE_TTL_MS });
    try {
      const p = txCachePath(key);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(tx), "utf8");
    } catch {
      // ignore
    }
    return tx;
  } catch {
    mem.set(key, { value: null, expiresAt: now + 1000 * 60 * 10 });
    return null;
  }
}

type DecodedTradeItem = {
  kind: "buy" | "sell";
  fdfPair: string;
  playerToken?: string;
  tokenIdDec: string;
  shareAmountRaw: string;

  counterparty: {
    initiator: string;
    recipient: string;
  };

  // Currency values are USDC base units (1e6) as emitted by the contract.
  currencyRaw: string;
  feeRaw: string;

  // Helpful derived fields.
  priceUsdcPerShareRaw?: string; // excludes fee
  priceUsdcPerShareIncFeeRaw?: string; // includes fee (buy only; for sell it's gross)

  // Per-wallet flow (for cost basis / PnL).
  walletShareDeltaRaw: string;
  walletCurrencyDeltaRaw: string;
  // Optional reconciliation metadata when tx-level receipt deltas are used.
  walletCurrencyDeltaEventRaw?: string;
  walletCurrencyDeltaSource?: "event" | "receipt_reconciled";
};

type DecodedPromotionItem = {
  kind: "promotion";
  developmentPlayers: string;
  playerToken?: string;
  account: string;
  tokenIdDec: string;
  shareAmountRaw: string;
  walletShareDeltaRaw: string;
};

type InferredTrade = {
  kind: "buy" | "sell" | "unknown";
  contractAddress?: string;
  tokenIdDec?: string;
  shareDeltaRaw?: string;
  priceUsdcPerShareRaw?: string;
};

type Erc1155Change = {
  contractAddress: string;
  tokenIdHex: string;
  tokenIdDec: string;
  deltaRaw: string;
};

type ReconciledTransfer = {
  kind: "transfer_in" | "transfer_out";
  contractAddress: string;
  tokenIdDec: string;
  deltaRaw: string;
  note: "unknown"; // zero cost / unknown provenance
  reason: "erc1155_unexplained_delta";
};

type ActivityItem = {
  hash: string;
  timestamp?: string;
  usdcDeltaRaw: string;
  funDeltaRaw: string;
  erc1155Changes: Erc1155Change[];
  inferred?: InferredTrade;
};

type ActivityEnrichedItem = ActivityItem & {
  kind: "buy" | "sell" | "scam" | "unknown";
  decoded?: {
    trades: DecodedTradeItem[];
    promotions: DecodedPromotionItem[];
    contractRenewals: DecodedContractRenewalItem[];
    packOpens: DecodedPackOpenItem[];
    deposits: DecodedDepositItem[];
    scams: DecodedScamItem[];
    unknownSportfunTopics: Array<{ address: string; topic0: string }>;
  };
  // If decoded trades/promotions don't fully explain the ERC-1155 delta for the wallet,
  // we add synthetic ledger ops to keep analytics/positions aligned with on-chain holdings.
  reconciledTransfers?: ReconciledTransfer[];
  receipt?: TxReceipt;
};

function safeDiv(a: bigint, b: bigint): bigint | undefined {
  if (b === 0n) return undefined;
  return a / b;
}

function proportionalRemoval(bucket: bigint, total: bigint, remove: bigint): bigint {
  if (bucket <= 0n || total <= 0n || remove <= 0n) return 0n;
  const raw = (bucket * remove + total / 2n) / total;
  if (raw <= 0n) return 0n;
  return raw > bucket ? bucket : raw;
}

function getDepositUsdcDeltaRaw(item: DecodedDepositItem): bigint {
  // "from_game_wallet" means wallet -> counterparty in our transfer classifier.
  // "to_game_wallet" means counterparty -> wallet.
  return item.direction === "to_game_wallet" ? BigInt(item.amountRaw) : -BigInt(item.amountRaw);
}

function sumRenewalUsdcDeltaRaw(renewals: DecodedContractRenewalItem[]): bigint {
  let delta = 0n;
  for (const renewal of renewals ?? []) {
    if (renewal.paymentToken.toLowerCase() !== BASE_USDC) continue;
    try {
      delta -= BigInt(renewal.amountPaidRaw);
    } catch {
      // ignore malformed rows
    }
  }
  return delta;
}

function sumDepositUsdcDeltaRaw(deposits: DecodedDepositItem[]): bigint {
  let delta = 0n;
  for (const deposit of deposits ?? []) {
    if (deposit.paymentToken.toLowerCase() !== BASE_USDC) continue;
    try {
      delta += getDepositUsdcDeltaRaw(deposit);
    } catch {
      // ignore malformed rows
    }
  }
  return delta;
}

function sumTradeUsdcDeltaRaw(trades: DecodedTradeItem[]): bigint {
  let delta = 0n;
  for (const trade of trades ?? []) {
    try {
      delta += BigInt(trade.walletCurrencyDeltaRaw);
    } catch {
      // ignore malformed rows
    }
  }
  return delta;
}

function reconcileTradeUsdcWithReceipt(params: {
  trades: DecodedTradeItem[];
  renewals: DecodedContractRenewalItem[];
  deposits: DecodedDepositItem[];
  effectiveUsdcDelta: bigint;
}): DecodedTradeItem[] {
  const trades = params.trades ?? [];
  if (!trades.length) return trades;

  const nonTradeUsdcDeltaRaw =
    sumRenewalUsdcDeltaRaw(params.renewals ?? []) +
    sumDepositUsdcDeltaRaw(params.deposits ?? []);

  const targetTradeUsdcDeltaRaw = params.effectiveUsdcDelta - nonTradeUsdcDeltaRaw;

  const eventDeltas: bigint[] = [];
  for (const trade of trades) {
    try {
      eventDeltas.push(BigInt(trade.walletCurrencyDeltaRaw));
    } catch {
      // If any delta is malformed, keep event values as-is.
      return trades;
    }
  }
  const eventTradeUsdcDeltaRaw = eventDeltas.reduce((sum, value) => sum + value, 0n);
  if (eventTradeUsdcDeltaRaw === targetTradeUsdcDeltaRaw) {
    return trades.map((trade) => ({ ...trade, walletCurrencyDeltaSource: "event" }));
  }

  const hasSingleTrade = trades.length === 1;
  if (eventTradeUsdcDeltaRaw === 0n && !hasSingleTrade) {
    // Can't proportionally reconcile multiple rows when the event sum is zero.
    return trades.map((trade) => ({ ...trade, walletCurrencyDeltaSource: "event" }));
  }

  const adjusted: DecodedTradeItem[] = [];
  let assigned = 0n;

  for (let i = 0; i < trades.length; i += 1) {
    const trade = trades[i];
    const eventDelta = eventDeltas[i];
    const isLast = i === trades.length - 1;
    const nextDelta = hasSingleTrade
      ? targetTradeUsdcDeltaRaw
      : isLast
        ? targetTradeUsdcDeltaRaw - assigned
        : (targetTradeUsdcDeltaRaw * eventDelta) / eventTradeUsdcDeltaRaw;

    if (!hasSingleTrade && !isLast) assigned += nextDelta;

    adjusted.push({
      ...trade,
      walletCurrencyDeltaRaw: nextDelta.toString(10),
      walletCurrencyDeltaEventRaw: eventDelta.toString(10),
      walletCurrencyDeltaSource: nextDelta === eventDelta ? "event" : "receipt_reconciled",
    });
  }

  return adjusted;
}

function reconcilePackOpenUsdcWithReceipt(params: {
  packOpens: DecodedPackOpenItem[];
  trades: DecodedTradeItem[];
  renewals: DecodedContractRenewalItem[];
  deposits: DecodedDepositItem[];
  effectiveUsdcDelta: bigint;
}): DecodedPackOpenItem[] {
  const packOpens = params.packOpens ?? [];
  if (!packOpens.length) return packOpens;

  const knownUsdcDeltaRaw =
    sumTradeUsdcDeltaRaw(params.trades ?? []) +
    sumRenewalUsdcDeltaRaw(params.renewals ?? []) +
    sumDepositUsdcDeltaRaw(params.deposits ?? []);
  const targetPackUsdcDeltaRaw = params.effectiveUsdcDelta - knownUsdcDeltaRaw;

  const withDefaults = packOpens.map((item) => ({
    ...item,
    walletCurrencyDeltaRaw: item.walletCurrencyDeltaRaw ?? "0",
  }));
  if (targetPackUsdcDeltaRaw === 0n) return withDefaults;
  if (withDefaults.length === 1) {
    return [
      {
        ...withDefaults[0],
        walletCurrencyDeltaRaw: targetPackUsdcDeltaRaw.toString(10),
        walletCurrencyDeltaSource: "receipt_reconciled",
      },
    ];
  }

  const weights = withDefaults.map((item) => {
    try {
      const share = BigInt(item.shareAmountRaw);
      return share < 0n ? -share : share;
    } catch {
      return 0n;
    }
  });
  const weightSum = weights.reduce((sum, value) => sum + value, 0n);
  if (weightSum === 0n) {
    const divisor = BigInt(withDefaults.length);
    const perItem = targetPackUsdcDeltaRaw / divisor;
    let distributed = 0n;
    return withDefaults.map((item, idx) => {
      const isLast = idx === withDefaults.length - 1;
      if (!isLast) {
        distributed += perItem;
        return {
          ...item,
          walletCurrencyDeltaRaw: perItem.toString(10),
          walletCurrencyDeltaSource: "receipt_reconciled",
        };
      }
      return {
        ...item,
        walletCurrencyDeltaRaw: (targetPackUsdcDeltaRaw - distributed).toString(10),
        walletCurrencyDeltaSource: "receipt_reconciled",
      };
    });
  }

  const adjusted: DecodedPackOpenItem[] = [];
  let assigned = 0n;
  for (let i = 0; i < withDefaults.length; i += 1) {
    const item = withDefaults[i];
    const isLast = i === withDefaults.length - 1;
    const nextDelta = isLast
      ? targetPackUsdcDeltaRaw - assigned
      : (targetPackUsdcDeltaRaw * weights[i]) / weightSum;
    if (!isLast) assigned += nextDelta;
    adjusted.push({
      ...item,
      walletCurrencyDeltaRaw: nextDelta.toString(10),
      walletCurrencyDeltaSource: "receipt_reconciled",
    });
  }
  return adjusted;
}

function dedupeDeposits(items: DecodedDepositItem[]): DecodedDepositItem[] {
  const byKey = new Map<string, bigint>();
  for (const item of items) {
    const amount = BigInt(item.amountRaw);
    if (amount <= 0n) continue;
    const key = `${item.direction}:${item.counterparty}:${item.paymentToken}`;
    byKey.set(key, (byKey.get(key) ?? 0n) + amount);
  }
  return [...byKey.entries()].map(([key, amount]) => {
    const [direction, counterparty, paymentToken] = key.split(":");
    return {
      kind: "deposit",
      direction: direction as DecodedDepositItem["direction"],
      counterparty,
      amountRaw: amount.toString(10),
      paymentToken,
    };
  });
}

function dedupeScamItems(items: DecodedScamItem[]): DecodedScamItem[] {
  const byKey = new Map<string, DecodedScamItem>();
  for (const item of items) {
    const key = [
      item.category,
      item.counterparty,
      item.contractAddress ?? "",
      item.tokenIdDec ?? "",
      item.tokenIdHex ?? "",
      item.amountRaw ?? "",
      item.reason,
    ].join(":");
    if (!byKey.has(key)) byKey.set(key, item);
  }
  return [...byKey.values()];
}

function decodeReceiptForSportfun(params: {
  receipt: TxReceipt;
  walletLc: string;
  depositCounterparties: Set<string>;
}): {
  trades: DecodedTradeItem[];
  promotions: DecodedPromotionItem[];
  contractRenewals: DecodedContractRenewalItem[];
  packOpens: DecodedPackOpenItem[];
  deposits: DecodedDepositItem[];
  scams: DecodedScamItem[];
  unknownSportfunTopics: Array<{ address: string; topic0: string }>;
} {
  const trades: DecodedTradeItem[] = [];
  const promotions: DecodedPromotionItem[] = [];
  const contractRenewals: DecodedContractRenewalItem[] = [];
  const packOpens: DecodedPackOpenItem[] = [];
  const deposits: DecodedDepositItem[] = [];
  const scams: DecodedScamItem[] = [];
  const unknownSportfunTopics: Array<{ address: string; topic0: string }> = [];

  const logs = params.receipt.logs ?? [];

  for (const log of logs) {
    const addrLc = toLower(log.address);
    const topic0 = (log.topics?.[0] ?? "0x") as string;

    // Trades via FDFPair.
    if (isOneOf(addrLc, SPORTFUN_FDF_PAIR_CONTRACTS)) {
      if (topic0 !== SPORTFUN_TOPICS.PlayerTokensPurchase && topic0 !== SPORTFUN_TOPICS.CurrencyPurchase) {
        // Ignore other pair events.
        continue;
      }

      try {
        const decoded = decodeEventLog({
          abi: FDFPAIR_EVENTS_ABI,
          data: log.data,
          topics: log.topics as [Hex, ...Hex[]],
        });

        if (!decoded.args) continue;

        const playerToken = getPlayerTokenForFdfPair(addrLc);

        if (decoded.eventName === "PlayerTokensPurchase") {
          const buyer = toLower(String(decoded.args.buyer));
          const recipient = toLower(String(decoded.args.recipient));

          const ids = decoded.args.playerTokenIds as readonly bigint[];
          const amounts = decoded.args.playerTokenAmountsToBuy as readonly bigint[];
          const currencySpent = decoded.args.currencySpent as readonly bigint[];
          const feeAmounts = decoded.args.feeAmounts as readonly bigint[];

          for (let i = 0; i < ids.length; i++) {
            const tokenId = ids[i];
            const shareAmount = amounts[i] ?? 0n;
            const currency = currencySpent[i] ?? 0n;
            const fee = feeAmounts[i] ?? 0n;

            const priceExFee = safeDiv(currency * 10n ** 18n, shareAmount);
            const priceIncFee = safeDiv((currency + fee) * 10n ** 18n, shareAmount);

            const walletShareDelta = recipient === params.walletLc ? shareAmount : 0n;
            const walletCurrencyDelta = buyer === params.walletLc ? -(currency + fee) : 0n;

            // Only keep wallet-relevant trades (those that change this wallet's shares).
            if (walletShareDelta === 0n) continue;

            trades.push({
              kind: "buy",
              fdfPair: addrLc,
              playerToken,
              tokenIdDec: tokenId.toString(10),
              shareAmountRaw: shareAmount.toString(10),
              counterparty: { initiator: buyer, recipient },
              currencyRaw: currency.toString(10),
              feeRaw: fee.toString(10),
              priceUsdcPerShareRaw: priceExFee?.toString(10),
              priceUsdcPerShareIncFeeRaw: priceIncFee?.toString(10),
              walletShareDeltaRaw: walletShareDelta.toString(10),
              walletCurrencyDeltaRaw: walletCurrencyDelta.toString(10),
            });
          }
        }

        if (decoded.eventName === "CurrencyPurchase") {
          const seller = toLower(String(decoded.args.seller));
          const recipient = toLower(String(decoded.args.recipient));

          const ids = decoded.args.playerTokenIds as readonly bigint[];
          const amounts = decoded.args.playerTokenAmountsSold as readonly bigint[];
          const currencyReceived = decoded.args.currencyReceived as readonly bigint[];
          const feeAmounts = decoded.args.feeAmounts as readonly bigint[];

          for (let i = 0; i < ids.length; i++) {
            const tokenId = ids[i];
            const shareAmount = amounts[i] ?? 0n;
            const currency = currencyReceived[i] ?? 0n;
            const fee = feeAmounts[i] ?? 0n;

            const priceNet = safeDiv(currency * 10n ** 18n, shareAmount);
            const priceGross = safeDiv((currency + fee) * 10n ** 18n, shareAmount);

            const walletShareDelta = seller === params.walletLc ? -shareAmount : 0n;
            const walletCurrencyDelta = recipient === params.walletLc ? currency : 0n;

            // Only keep wallet-relevant trades (those that change this wallet's shares).
            if (walletShareDelta === 0n) continue;

            trades.push({
              kind: "sell",
              fdfPair: addrLc,
              playerToken,
              tokenIdDec: tokenId.toString(10),
              shareAmountRaw: shareAmount.toString(10),
              counterparty: { initiator: seller, recipient },
              currencyRaw: currency.toString(10),
              feeRaw: fee.toString(10),
              priceUsdcPerShareRaw: priceNet?.toString(10),
              priceUsdcPerShareIncFeeRaw: priceGross?.toString(10),
              walletShareDeltaRaw: walletShareDelta.toString(10),
              walletCurrencyDeltaRaw: walletCurrencyDelta.toString(10),
            });
          }
        }
      } catch {
        unknownSportfunTopics.push({ address: addrLc, topic0 });
      }

      continue;
    }

    // Promotions via DevelopmentPlayers.
    if (isOneOf(addrLc, SPORTFUN_DEV_PLAYERS_CONTRACTS)) {
      if (topic0 !== SPORTFUN_TOPICS.PlayerSharesPromoted) continue;

      try {
        const decoded = decodeEventLog({
          abi: DEVPLAYERS_EVENTS_ABI,
          data: log.data,
          topics: log.topics as [Hex, ...Hex[]],
        });

        if (!decoded.args) continue;
        if (decoded.eventName !== "PlayerSharesPromoted") continue;

        const account = toLower(String(decoded.args.account));
        const ids = decoded.args.playerTokenIds as readonly bigint[];
        const amounts = decoded.args.playerTokenAmounts as readonly bigint[];

        const playerToken = getPlayerTokenForDevPlayers(addrLc);

        for (let i = 0; i < ids.length; i++) {
          const tokenId = ids[i];
          const shareAmount = amounts[i] ?? 0n;
          const walletShareDelta = account === params.walletLc ? shareAmount : 0n;

          if (walletShareDelta === 0n) continue;

          promotions.push({
            kind: "promotion",
            developmentPlayers: addrLc,
            playerToken,
            account,
            tokenIdDec: tokenId.toString(10),
            shareAmountRaw: shareAmount.toString(10),
            walletShareDeltaRaw: walletShareDelta.toString(10),
          });
        }
      } catch {
        unknownSportfunTopics.push({ address: addrLc, topic0 });
      }

      continue;
    }

    // Athlete contract renewals (USDC expense, no share transfer).
    if (topic0 === SPORTFUN_TOPICS.ContractRenewed) {
      const renewal = decodeContractRenewalLog({ log, walletLc: params.walletLc });
      if (renewal) contractRenewals.push(renewal);
      continue;
    }

    // Wallet <-> game-wallet USDC movements (deposit / withdrawal).
    if (addrLc === BASE_USDC && topic0 === ERC20_TRANSFER_TOPIC0 && (log.topics?.length ?? 0) >= 3) {
      const fromLc = topicToAddressLc(log.topics[1]);
      const toLc = topicToAddressLc(log.topics[2]);
      const amount = parseBigIntish(log.data);
      if (amount > 0n) {
        if (fromLc === params.walletLc && params.depositCounterparties.has(toLc)) {
          deposits.push({
            kind: "deposit",
            direction: "from_game_wallet",
            counterparty: toLc,
            amountRaw: amount.toString(10),
            paymentToken: BASE_USDC,
          });
        }
        if (toLc === params.walletLc && params.depositCounterparties.has(fromLc)) {
          deposits.push({
            kind: "deposit",
            direction: "to_game_wallet",
            counterparty: fromLc,
            amountRaw: amount.toString(10),
            paymentToken: BASE_USDC,
          });
        }
      }
      continue;
    }
  }

  return {
    trades,
    promotions,
    contractRenewals,
    packOpens,
    deposits: dedupeDeposits(deposits),
    scams: dedupeScamItems(scams),
    unknownSportfunTopics,
  };
}

function tokenKey(playerToken: string, tokenIdDec: string): string {
  return `${playerToken.toLowerCase()}:${tokenIdDec}`;
}

type PositionTournamentTpAggregate = {
  averageTpPerTournament: number;
  tournamentsCount: number;
  tournamentTpTotal: number;
  lastTournamentAt?: string;
};

function getTournamentTpSport(contractAddress: string): SportfunTournamentTpSport | null {
  const sport = getSportfunSportLabel(contractAddress);
  if (sport === "nfl") return "nfl";
  if (sport === "soccer") return "football";
  return null;
}

function buildTournamentTpAggregateByName(
  rows: SportfunTournamentTpLookupRow[]
): Map<string, PositionTournamentTpAggregate> {
  const byName = new Map<
    string,
    {
      tpTotal: number;
      tournaments: Set<string>;
      latestTs: number;
      latestAsOf?: string;
      dedupe: Set<string>;
    }
  >();

  for (const row of rows) {
    const normalized = normalizeSportfunAthleteName(row.athleteName);
    if (!normalized) continue;
    const current = byName.get(normalized) ?? {
      tpTotal: 0,
      tournaments: new Set<string>(),
      latestTs: Number.NaN,
      latestAsOf: undefined,
      dedupe: new Set<string>(),
    };
    const dedupeKey = `${row.athleteId}:${row.tournamentKey}`;
    if (current.dedupe.has(dedupeKey)) {
      continue;
    }
    current.dedupe.add(dedupeKey);
    current.tpTotal += row.tpTotal;
    current.tournaments.add(row.tournamentKey);
    const rowTs = Date.parse(row.asOf ?? "");
    if (Number.isFinite(rowTs) && (!Number.isFinite(current.latestTs) || rowTs > current.latestTs)) {
      current.latestTs = rowTs;
      current.latestAsOf = row.asOf;
    }
    byName.set(normalized, current);
  }

  const out = new Map<string, PositionTournamentTpAggregate>();
  for (const [name, entry] of byName.entries()) {
    const tournamentsCount = entry.tournaments.size;
    if (tournamentsCount <= 0) continue;
    out.set(name, {
      averageTpPerTournament: entry.tpTotal / tournamentsCount,
      tournamentsCount,
      tournamentTpTotal: entry.tpTotal,
      lastTournamentAt: entry.latestAsOf,
    });
  }
  return out;
}

export async function GET(request: Request, context: { params: Promise<{ address: string }> }) {
  const { address } = paramsSchema.parse(await context.params);
  if (!isAddress(address)) return invalidAddressResponse(address);
  const url = new URL(request.url);
  const q = querySchema.parse(Object.fromEntries(url.searchParams.entries()));

  const wallet = address;
  const walletLc = wallet.toLowerCase();

  const scanMode = q.scanMode ?? "default";
  const scanStartBlock = await getScanStartBlockHex();
  const isVercel = Boolean(process.env.VERCEL);
  // Keep the request budget for the expensive transfer/receipt work, not for initial setup.
  const deadlineMs = scanMode === "full" ? undefined : Date.now() + (isVercel ? 7_000 : 10_000);
  const hasTime = (minMs: number) => (deadlineMs ? Date.now() < deadlineMs - minMs : true);

  const includeTrades = parseBool(q.includeTrades, true);
  const includePrices = parseBool(q.includePrices, true);
  const includeReceipts = parseBool(q.includeReceipts, false);
  const includeMetadata = parseBool(q.includeMetadata, true);
  const includeUri = parseBool(q.includeUri, includeMetadata) || includeMetadata;
  const metadataLimit = q.metadataLimit;

  const maxCount = q.maxCount ?? "0x3e8"; // 1000 per page

  // Higher ceilings for "ideal" mode. Still capped to avoid runaway requests.
  const maxPagesCeil = scanMode === "full" ? 200 : 10;
  const maxActivityCeil = scanMode === "full" ? 20000 : 500;

  const maxPages = Math.max(1, Math.min(maxPagesCeil, q.maxPages ? Number(q.maxPages) : scanMode === "full" ? 50 : 3));
  const maxActivity = Math.max(1, Math.min(maxActivityCeil, q.maxActivity ? Number(q.maxActivity) : scanMode === "full" ? 5000 : 100));
  const activityCursor = q.activityCursor ? Number(q.activityCursor) : 0;

  const cacheKeyRaw = [
    "sportfun:portfolio",
    `v${PORTFOLIO_CACHE_SCHEMA_VERSION}`,
    walletLc,
    scanMode,
    maxPages,
    maxActivity,
    includeTrades ? "1" : "0",
    includePrices ? "1" : "0",
    includeMetadata ? "1" : "0",
    includeUri ? "1" : "0",
    metadataLimit ?? "",
    scanStartBlock,
    activityCursor,
  ].join(":");
  const cacheKey = `sportfun:portfolio:${sha1Hex(cacheKeyRaw)}`;
  const cacheTtl = scanMode === "full" ? 900 : 300;

  async function buildPayload() {
  const depositCounterparties = getSportfunDepositCounterparties();
  const [erc1155IncomingRes, erc1155OutgoingRes] = await Promise.all([
    fetchTransfersForWallet({
      address: wallet,
      direction: "incoming",
      category: "erc1155",
      // Restrict to known Sport.fun ERC-1155 contracts to reduce pages.
      contractAddresses: [...SPORTFUN_ERC1155_CONTRACTS],
      maxCount,
      maxPages,
      deadlineMs,
      fromBlock: scanStartBlock,
    }),
    fetchTransfersForWallet({
      address: wallet,
      direction: "outgoing",
      category: "erc1155",
      contractAddresses: [...SPORTFUN_ERC1155_CONTRACTS],
      maxCount,
      maxPages,
      deadlineMs,
      fromBlock: scanStartBlock,
    }),
  ]);

  const erc1155Transfers = dedupeTransfers([...erc1155IncomingRes.transfers, ...erc1155OutgoingRes.transfers]);

  // Aggregate balances per (contract, tokenId) and capture per-tx ERC-1155 deltas.
  const balances = new Map<string, bigint>();
  const contractSet = new Set<string>();
  const timestampByHash = new Map<string, string>();

  // txHash -> (contract:tokenIdHexNoPrefix) -> delta
  const erc1155DeltaByHash = new Map<string, Map<string, bigint>>();

  for (const t of erc1155Transfers) {
    const contract = toLower(t.rawContract?.address);
    if (!contract) continue;

    // Only consider known Sport.fun ERC-1155 contracts.
    if (!isOneOf(contract, SPORTFUN_ERC1155_CONTRACTS)) continue;

    contractSet.add(contract);

    if (t.hash && t.metadata?.blockTimestamp) {
      timestampByHash.set(t.hash, t.metadata.blockTimestamp);
    }

    const fromLc = toLower(t.from);
    const toLc = toLower(t.to);

    const metas = t.erc1155Metadata ?? [];
    for (const m of metas) {
      const tokenId = parseBigIntish(m.tokenId);
      const value = parseBigIntish(m.value);

      const tokenKeyLocal = `${contract}:${tokenId.toString(16)}`;

      // balances
      const prev = balances.get(tokenKeyLocal) ?? 0n;
      let next = prev;
      if (toLc === walletLc) next = prev + value;
      if (fromLc === walletLc) next = next - value;
      balances.set(tokenKeyLocal, next);

      // per-tx delta
      if (t.hash) {
        const txKey = t.hash;
        const deltas = erc1155DeltaByHash.get(txKey) ?? new Map<string, bigint>();

        let delta = 0n;
        if (toLc === walletLc) delta += value;
        if (fromLc === walletLc) delta -= value;

        deltas.set(tokenKeyLocal, (deltas.get(tokenKeyLocal) ?? 0n) + delta);
        erc1155DeltaByHash.set(txKey, deltas);
      }
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

  // Fetch USDC/FUN transfers and compute per-tx deltas by hash.
  const [usdcIncomingRes, usdcOutgoingRes, funIncomingRes, funOutgoingRes] = await Promise.all([
    fetchTransfersForWallet({
      address: wallet,
      direction: "incoming",
      category: "erc20",
      contractAddresses: [BASE_USDC],
      maxCount,
      maxPages,
      deadlineMs,
      fromBlock: scanStartBlock,
    }),
    fetchTransfersForWallet({
      address: wallet,
      direction: "outgoing",
      category: "erc20",
      contractAddresses: [BASE_USDC],
      maxCount,
      maxPages,
      deadlineMs,
      fromBlock: scanStartBlock,
    }),
    fetchTransfersForWallet({
      address: wallet,
      direction: "incoming",
      category: "erc20",
      contractAddresses: [SPORTFUN_FUN_TOKEN_ADDRESS],
      maxCount,
      maxPages,
      deadlineMs,
      fromBlock: scanStartBlock,
    }),
    fetchTransfersForWallet({
      address: wallet,
      direction: "outgoing",
      category: "erc20",
      contractAddresses: [SPORTFUN_FUN_TOKEN_ADDRESS],
      maxCount,
      maxPages,
      deadlineMs,
      fromBlock: scanStartBlock,
    }),
  ]);

  const usdcTransfers = dedupeTransfers([...usdcIncomingRes.transfers, ...usdcOutgoingRes.transfers]);
  const funTransfers = dedupeTransfers([...funIncomingRes.transfers, ...funOutgoingRes.transfers]);

  // Detect unsupported assets:
  // 1) wallet -> game-wallet (explicit scam/deposit noise for game accounting),
  // 2) unknown incoming assets to the wallet (airdrop/spoof spam surface).
  const scamFetchTargets: Array<{
    category: "erc20" | "erc721" | "erc1155";
    direction: "incoming" | "outgoing";
    counterpartyAddress?: string;
  }> = [
    ...[...depositCounterparties].flatMap((counterparty) => [
      { category: "erc20" as const, direction: "outgoing" as const, counterpartyAddress: counterparty },
      { category: "erc721" as const, direction: "outgoing" as const, counterpartyAddress: counterparty },
      { category: "erc1155" as const, direction: "outgoing" as const, counterpartyAddress: counterparty },
    ]),
    { category: "erc20" as const, direction: "incoming" as const },
    { category: "erc721" as const, direction: "incoming" as const },
    { category: "erc1155" as const, direction: "incoming" as const },
  ];
  const scamTransferResponses = await Promise.all(
    scamFetchTargets.map((target) =>
      fetchTransfersForWallet({
        address: wallet,
        direction: target.direction,
        category: target.category,
        counterpartyAddress: target.counterpartyAddress,
        maxCount,
        maxPages,
        deadlineMs,
        fromBlock: scanStartBlock,
      })
    )
  );
  const scamTransfers = dedupeTransfers(
    scamTransferResponses.flatMap((res) => res.transfers)
  );

  const scan = {
    mode: scanMode,
    deadlineMs,
    erc1155: {
      incoming: {
        pagesFetched: erc1155IncomingRes.pagesFetched,
        hasMore: Boolean(erc1155IncomingRes.nextPageKey),
        truncatedByBudget: erc1155IncomingRes.truncatedByBudget,
        sync: erc1155IncomingRes.sync,
      },
      outgoing: {
        pagesFetched: erc1155OutgoingRes.pagesFetched,
        hasMore: Boolean(erc1155OutgoingRes.nextPageKey),
        truncatedByBudget: erc1155OutgoingRes.truncatedByBudget,
        sync: erc1155OutgoingRes.sync,
      },
    },
    usdc: {
      incoming: {
        pagesFetched: usdcIncomingRes.pagesFetched,
        hasMore: Boolean(usdcIncomingRes.nextPageKey),
        truncatedByBudget: usdcIncomingRes.truncatedByBudget,
        sync: usdcIncomingRes.sync,
      },
      outgoing: {
        pagesFetched: usdcOutgoingRes.pagesFetched,
        hasMore: Boolean(usdcOutgoingRes.nextPageKey),
        truncatedByBudget: usdcOutgoingRes.truncatedByBudget,
        sync: usdcOutgoingRes.sync,
      },
    },
    fun: {
      incoming: {
        pagesFetched: funIncomingRes.pagesFetched,
        hasMore: Boolean(funIncomingRes.nextPageKey),
        truncatedByBudget: funIncomingRes.truncatedByBudget,
        sync: funIncomingRes.sync,
      },
      outgoing: {
        pagesFetched: funOutgoingRes.pagesFetched,
        hasMore: Boolean(funOutgoingRes.nextPageKey),
        truncatedByBudget: funOutgoingRes.truncatedByBudget,
        sync: funOutgoingRes.sync,
      },
    },
    scamCandidates: {
      pagesFetched: scamTransferResponses.reduce((sum, item) => sum + item.pagesFetched, 0),
      hasMore: scamTransferResponses.some((item) => Boolean(item.nextPageKey)),
      truncatedByBudget: scamTransferResponses.some((item) => item.truncatedByBudget),
      transferCount: scamTransfers.length,
    },
  };

  const scanTruncatedByBudget =
    scan.erc1155.incoming.truncatedByBudget ||
    scan.erc1155.outgoing.truncatedByBudget ||
    scan.usdc.incoming.truncatedByBudget ||
    scan.usdc.outgoing.truncatedByBudget ||
    scan.fun.incoming.truncatedByBudget ||
    scan.fun.outgoing.truncatedByBudget ||
    scan.scamCandidates.truncatedByBudget;

  const scanIncomplete =
    scanTruncatedByBudget ||
    scan.erc1155.incoming.hasMore ||
    scan.erc1155.outgoing.hasMore ||
    scan.usdc.incoming.hasMore ||
    scan.usdc.outgoing.hasMore ||
    scan.fun.incoming.hasMore ||
    scan.fun.outgoing.hasMore ||
    scan.scamCandidates.hasMore;

  const usdcDeltaByHash = new Map<string, bigint>();
  const funDeltaByHash = new Map<string, bigint>();
  const depositsByHash = new Map<string, DecodedDepositItem[]>();
  const scamsByHash = new Map<string, DecodedScamItem[]>();
  const tokenContractsByTokenId = new Map<string, Set<string>>();

  const addTokenContractCandidate = (tokenIdDec: string | undefined, contractAddress: string | undefined) => {
    if (!tokenIdDec || !contractAddress) return;
    const key = tokenIdDec.trim();
    if (!key) return;
    const contractLc = contractAddress.toLowerCase();
    const set = tokenContractsByTokenId.get(key) ?? new Set<string>();
    set.add(contractLc);
    tokenContractsByTokenId.set(key, set);
  };

  for (const h of holdings) addTokenContractCandidate(h.tokenIdDec, h.contractAddress);
  for (const deltas of erc1155DeltaByHash.values()) {
    for (const tokenKeyLocal of deltas.keys()) {
      const [contractAddress, tokenIdHexNoPrefix] = tokenKeyLocal.split(":");
      if (!contractAddress || !tokenIdHexNoPrefix) continue;
      const tokenIdDec = BigInt(`0x${tokenIdHexNoPrefix}`).toString(10);
      addTokenContractCandidate(tokenIdDec, contractAddress);
    }
  }

  const resolvePlayerTokenByTokenId = (tokenIdDec: string): string | undefined => {
    const set = tokenContractsByTokenId.get(tokenIdDec);
    if (!set || set.size !== 1) return undefined;
    return [...set][0];
  };

  for (const t of usdcTransfers) {
    const txHash = t.hash;
    if (!txHash) continue;

    const contract = toLower(t.rawContract?.address);
    if (contract !== BASE_USDC) continue;

    if (t.metadata?.blockTimestamp) {
      if (!timestampByHash.has(txHash)) timestampByHash.set(txHash, t.metadata.blockTimestamp);
    }

    const rawValue = t.rawContract?.value ?? "0x0";
    const value = parseBigIntish(rawValue);

    const fromLc = toLower(t.from);
    const toLc = toLower(t.to);

    let delta = 0n;
    if (toLc === walletLc) delta += value;
    if (fromLc === walletLc) delta -= value;

    usdcDeltaByHash.set(txHash, (usdcDeltaByHash.get(txHash) ?? 0n) + delta);

    if (value > 0n) {
      let depositItem: DecodedDepositItem | null = null;
      if (fromLc === walletLc && depositCounterparties.has(toLc)) {
        depositItem = {
          kind: "deposit",
          direction: "from_game_wallet",
          counterparty: toLc,
          amountRaw: value.toString(10),
          paymentToken: BASE_USDC,
        };
      } else if (toLc === walletLc && depositCounterparties.has(fromLc)) {
        depositItem = {
          kind: "deposit",
          direction: "to_game_wallet",
          counterparty: fromLc,
          amountRaw: value.toString(10),
          paymentToken: BASE_USDC,
        };
      }

      if (depositItem) {
        const existing = depositsByHash.get(txHash) ?? [];
        existing.push(depositItem);
        depositsByHash.set(txHash, existing);
      }
    }
  }

  for (const [hash, items] of depositsByHash.entries()) {
    depositsByHash.set(hash, dedupeDeposits(items));
  }

  for (const t of funTransfers) {
    const txHash = t.hash;
    if (!txHash) continue;

    const contract = toLower(t.rawContract?.address);
    if (contract !== SPORTFUN_FUN_TOKEN_ADDRESS) continue;

    if (t.metadata?.blockTimestamp) {
      if (!timestampByHash.has(txHash)) timestampByHash.set(txHash, t.metadata.blockTimestamp);
    }

    const rawValue = t.rawContract?.value ?? "0x0";
    const value = parseBigIntish(rawValue);
    if (value <= 0n) continue;

    const fromLc = toLower(t.from);
    const toLc = toLower(t.to);

    let delta = 0n;
    if (toLc === walletLc) delta += value;
    if (fromLc === walletLc) delta -= value;
    if (delta === 0n) continue;

    funDeltaByHash.set(txHash, (funDeltaByHash.get(txHash) ?? 0n) + delta);
  }

  const allowedGameWalletErc20 = new Set([
    BASE_USDC,
    SPORTFUN_FUN_TOKEN_ADDRESS,
  ].map((x) => x.toLowerCase()));
  const allowedGameWalletErc1155 = new Set(
    [...SPORTFUN_ERC1155_CONTRACTS].map((x) => x.toLowerCase())
  );

  for (const t of scamTransfers) {
    const txHash = t.hash;
    if (!txHash) continue;

    const fromLc = toLower(t.from);
    const toLc = toLower(t.to);
    const isToGameWallet = fromLc === walletLc && depositCounterparties.has(toLc);
    const isIncomingToWallet = toLc === walletLc;
    if (!isToGameWallet && !isIncomingToWallet) continue;

    const reason: DecodedScamItem["reason"] = isToGameWallet
      ? "unsupported_game_wallet_asset"
      : "unsupported_wallet_asset";
    const counterparty = isToGameWallet ? toLc : fromLc;
    if (!counterparty) continue;

    if (t.metadata?.blockTimestamp) {
      if (!timestampByHash.has(txHash)) timestampByHash.set(txHash, t.metadata.blockTimestamp);
    }

    const category = toLower(t.category);
    const contractAddress = toLower(t.rawContract?.address) || undefined;
    const rows: DecodedScamItem[] = [];

    if (category === "erc20") {
      if (!contractAddress || allowedGameWalletErc20.has(contractAddress)) continue;
      const rawValue = t.rawContract?.value ?? "0x0";
      let amount = 0n;
      try {
        amount = parseBigIntish(rawValue);
      } catch {
        amount = 0n;
      }
      if (amount <= 0n) continue;
      rows.push({
        kind: "scam",
        category: "erc20",
        counterparty,
        contractAddress,
        amountRaw: amount.toString(10),
        reason,
      });
    } else if (category === "erc721") {
      const tokenIdRaw = t.erc721TokenId;
      let tokenIdDec: string | undefined;
      let tokenIdHex: string | undefined;
      if (tokenIdRaw) {
        try {
          const tokenId = parseBigIntish(tokenIdRaw);
          tokenIdDec = tokenId.toString(10);
          tokenIdHex = `0x${tokenId.toString(16)}`;
        } catch {
          // keep undefined
        }
      }
      rows.push({
        kind: "scam",
        category: "erc721",
        counterparty,
        contractAddress,
        tokenIdDec,
        tokenIdHex,
        amountRaw: "1",
        reason,
      });
    } else if (category === "erc1155") {
      if (contractAddress && allowedGameWalletErc1155.has(contractAddress)) continue;
      const metas = t.erc1155Metadata ?? [];
      if (!metas.length) {
        rows.push({
          kind: "scam",
          category: "erc1155",
          counterparty,
          contractAddress,
          reason,
        });
      } else {
        for (const meta of metas) {
          let tokenIdDec: string | undefined;
          let tokenIdHex: string | undefined;
          let amountRaw: string | undefined;
          try {
            const tokenId = parseBigIntish(meta.tokenId);
            tokenIdDec = tokenId.toString(10);
            tokenIdHex = `0x${tokenId.toString(16)}`;
          } catch {
            // keep undefined
          }
          try {
            const value = parseBigIntish(meta.value);
            amountRaw = value.toString(10);
          } catch {
            // keep undefined
          }
          rows.push({
            kind: "scam",
            category: "erc1155",
            counterparty,
            contractAddress,
            tokenIdDec,
            tokenIdHex,
            amountRaw,
            reason,
          });
        }
      }
    } else {
      continue;
    }

    if (!rows.length) continue;
    const existing = scamsByHash.get(txHash) ?? [];
    existing.push(...rows);
    scamsByHash.set(txHash, existing);
  }

  for (const [hash, items] of scamsByHash.entries()) {
    scamsByHash.set(hash, dedupeScamItems(items));
  }

  const contractRenewalsByHash = new Map<string, DecodedContractRenewalItem[]>();
  const shouldFetchContractRenewals = hasTime(1500);
  const contractRenewals = shouldFetchContractRenewals
    ? await fetchContractRenewalsForWallet({
        wallet,
        walletLc,
        fromBlock: scanStartBlock,
        deadlineMs,
      })
    : [];

  for (const renewal of contractRenewals) {
    const resolvedPlayerToken = renewal.playerToken ?? resolvePlayerTokenByTokenId(renewal.tokenIdDec);
    const normalized: DecodedContractRenewalItem = resolvedPlayerToken
      ? { ...renewal, playerToken: resolvedPlayerToken }
      : renewal;
    const txHash = normalized.txHash;
    if (!txHash) continue;
    const list = contractRenewalsByHash.get(txHash) ?? [];
    list.push(normalized);
    contractRenewalsByHash.set(txHash, list);
  }

  // Alchemy free-tier can reject broad eth_getLogs ranges (10-block cap), which may miss
  // ContractRenewed logs in `fetchContractRenewalsForWallet`. Backfill renewals from
  // outgoing USDC tx receipts so renewals still appear in activity/analytics.
  const shouldBackfillRenewalsFromReceipts = includeTrades && hasTime(1500);
  if (shouldBackfillRenewalsFromReceipts) {
    const usdcOutgoingHashes = Array.from(
      new Set(
        usdcTransfers
          .filter((t) => toLower(t.from) === walletLc && t.hash)
          .map((t) => toLower(t.hash))
      )
    );
    const renewalCandidateHashes = usdcOutgoingHashes.filter((hash) => !contractRenewalsByHash.has(hash));

    const renewalCandidateLimit = scanMode === "full" ? 1200 : 300;
    const renewalCandidates = renewalCandidateHashes.slice(0, renewalCandidateLimit);

    const renewalRows = await mapLimit(renewalCandidates, 4, async (hash) => {
      const cached = readDecodedCache(hash);
      if (cached?.decoded?.contractRenewals?.length) return { hash, renewals: cached.decoded.contractRenewals };

      const receipt = await fetchReceipt(hash);
      if (!receipt) return { hash, renewals: [] as DecodedContractRenewalItem[] };

      const decoded = decodeReceiptForSportfun({
        receipt,
        walletLc,
        depositCounterparties,
      });

      const usdcDeltaReceipt = decodeErc20DeltaFromReceipt({
        receipt,
        tokenAddressLc: BASE_USDC,
        walletLc,
      });

      writeDecodedCache(hash, {
        version: DECODED_CACHE_SCHEMA_VERSION,
        decoded,
        usdcDeltaReceipt: usdcDeltaReceipt !== null ? usdcDeltaReceipt.toString(10) : null,
      });

      return { hash, renewals: decoded.contractRenewals ?? [] };
    });

    for (const row of renewalRows) {
      if (!row.renewals.length) continue;
      const existing = contractRenewalsByHash.get(row.hash) ?? [];
      const merged = dedupeContractRenewals([...existing, ...row.renewals]);
      contractRenewalsByHash.set(row.hash, merged);
    }
  }

  const activityHashes = new Set<string>([
    ...erc1155DeltaByHash.keys(),
    ...contractRenewalsByHash.keys(),
    ...funDeltaByHash.keys(),
    ...depositsByHash.keys(),
    ...scamsByHash.keys(),
  ]);

  const activityAll = [...activityHashes]
    .map((hash) => {
      const deltas = erc1155DeltaByHash.get(hash) ?? new Map<string, bigint>();
      const erc1155Changes = [...deltas.entries()]
        .map(([tokenKeyLocal, deltaRaw]) => {
          const [contractAddress, tokenIdHexNoPrefix] = tokenKeyLocal.split(":");
          const tokenId = BigInt(`0x${tokenIdHexNoPrefix}`);
          return {
            contractAddress,
            tokenIdHex: `0x${tokenIdHexNoPrefix}`,
            tokenIdDec: tokenId.toString(10),
            deltaRaw: deltaRaw.toString(10),
          };
        })
        .filter((c) => c.deltaRaw !== "0");

      const usdcDelta = usdcDeltaByHash.get(hash) ?? 0n;
      const funDelta = funDeltaByHash.get(hash) ?? 0n;

      // Legacy best-effort inference (kept for fallback / sanity checks).
      let inferred:
        | {
            kind: "buy" | "sell" | "unknown";
            contractAddress?: string;
            tokenIdDec?: string;
            shareDeltaRaw?: string;
            priceUsdcPerShareRaw?: string; // USDC base units (1e6)
          }
        | undefined;

      if (erc1155Changes.length === 1) {
        const c = erc1155Changes[0];
        const shareDelta = BigInt(c.deltaRaw);
        const kind =
          shareDelta > 0n && usdcDelta < 0n
            ? "buy"
            : shareDelta < 0n && usdcDelta > 0n
              ? "sell"
              : "unknown";

        // price = |USDC| / |shares|, scaled to 1.0 share (1e18).
        let priceUsdcPerShareRaw: string | undefined;
        const absShares = shareDelta < 0n ? -shareDelta : shareDelta;
        const absUsdc = usdcDelta < 0n ? -usdcDelta : usdcDelta;
        if (absShares > 0n && absUsdc > 0n) {
          priceUsdcPerShareRaw = ((absUsdc * 10n ** 18n) / absShares).toString(10);
        }

        inferred = {
          kind,
          contractAddress: c.contractAddress,
          tokenIdDec: c.tokenIdDec,
          shareDeltaRaw: c.deltaRaw,
          priceUsdcPerShareRaw,
        };
      } else {
        inferred = { kind: "unknown" };
      }

      return {
        hash,
        timestamp: timestampByHash.get(hash),
        usdcDeltaRaw: usdcDelta.toString(10),
        funDeltaRaw: funDelta.toString(10),
        erc1155Changes,
        inferred,
      };
    })
    .sort((a, b) => String(b.timestamp ?? "").localeCompare(String(a.timestamp ?? "")));

  const activityOffset = Math.max(0, activityCursor);
  const activity = activityAll.slice(activityOffset, activityOffset + maxActivity);
  const activityTruncated = activityAll.length > activityOffset + activity.length;
  const nextActivityCursor = activityTruncated ? activityOffset + activity.length : undefined;

  const packOpensByHash = new Map<string, DecodedPackOpenItem[]>();
  const shouldDecodePackOpens = includeTrades && hasTime(1500);
  if (shouldDecodePackOpens) {
    const candidate = activity.filter((a) =>
      a.erc1155Changes.some((c) => BigInt(c.deltaRaw) > 0n)
    );
    const txRows = await mapLimit(candidate, 4, async (a) => {
      const tx = await fetchTransaction(a.hash);
      return { a, tx };
    });

    for (const { a, tx } of txRows) {
      if (!tx?.input || tx.input.length < 10) continue;
      const selector = tx.input.slice(0, 10).toLowerCase();
      if (!PACK_OPEN_SELECTORS.has(selector)) continue;

      const rows: DecodedPackOpenItem[] = [];
      for (const c of a.erc1155Changes) {
        const delta = BigInt(c.deltaRaw);
        if (delta <= 0n) continue;
        rows.push({
          kind: "pack_open",
          packContract: tx.to ? toLower(tx.to) : undefined,
          opener: toLower(tx.from),
          selector,
          playerToken: c.contractAddress,
          tokenIdDec: c.tokenIdDec,
          shareAmountRaw: delta.toString(10),
        });
      }

      if (rows.length) packOpensByHash.set(a.hash, rows);
    }
  }

  // Fetch and decode receipts (authoritative trade semantics).
  const receiptByHash = new Map<string, TxReceipt>();
  const decodedByHash = new Map<
    string,
    {
      trades: DecodedTradeItem[];
      promotions: DecodedPromotionItem[];
      contractRenewals: DecodedContractRenewalItem[];
      packOpens: DecodedPackOpenItem[];
      deposits: DecodedDepositItem[];
      scams: DecodedScamItem[];
      unknownSportfunTopics: Array<{ address: string; topic0: string }>;
    }
  >();
  const usdcDeltaReceiptByHash = new Map<string, bigint>();

  const shouldDecodeTrades = (includeTrades || includeReceipts) && hasTime(2500);
  if (shouldDecodeTrades) {
    const hashes = activity.map((a) => a.hash);

    const receipts = await mapLimit(hashes, 4, async (h) => {
      const cached = readDecodedCache(h);
      if (cached) return { h, r: null, cached };

      const r = await fetchReceipt(h);
      return { h, r };
    });

    for (const { h, r, cached } of receipts) {
      if (cached) {
        decodedByHash.set(h, cached.decoded);
        if (cached.usdcDeltaReceipt !== null) {
          usdcDeltaReceiptByHash.set(h, BigInt(cached.usdcDeltaReceipt));
        }
        continue;
      }

      if (!r) continue;
      receiptByHash.set(h, r);

      const decoded = decodeReceiptForSportfun({
        receipt: r,
        walletLc,
        depositCounterparties,
      });
      decodedByHash.set(h, decoded);

      const usdcDeltaReceipt = decodeErc20DeltaFromReceipt({
        receipt: r,
        tokenAddressLc: BASE_USDC,
        walletLc,
      });
      if (usdcDeltaReceipt !== null) usdcDeltaReceiptByHash.set(h, usdcDeltaReceipt);

      writeDecodedCache(h, {
        version: DECODED_CACHE_SCHEMA_VERSION,
        decoded,
        usdcDeltaReceipt: usdcDeltaReceipt !== null ? usdcDeltaReceipt.toString(10) : null,
      });
    }
  }

  // Prices / valuation from Supabase-backed store.
  // If Supabase is missing rows, we fill gaps from wallet hints/market snapshot and a
  // bounded on-chain `getPrices` fallback for unresolved holdings.
  const priceByHoldingKey = new Map<string, { priceUsdcPerShareRaw: bigint; valueUsdcRaw: bigint }>();

  const shouldIncludePrices = includePrices && hasTime(2000);
  if (shouldIncludePrices && holdings.length > 0) {
    // Non-blocking external refresh (GeckoTerminal + DexScreener) with 10m throttle.
    triggerSportfunExternalPricesRefresh({ reason: "portfolio_request" });

    const priceItems = holdings.map((h) => ({
      contractAddress: h.contractAddress,
      tokenIdDec: h.tokenIdDec,
    }));
    const storedPrices = await getStoredSportfunPrices({
      items: priceItems,
      allowContractFallback: false,
    });

    // If Supabase doesn't have a fresh row yet, seed it from the newest known trade hint
    // observed in wallet activity/caches (still avoiding getPrices eth_call fanout).
    const latestTradePriceByKey = new Map<string, { priceUsdcRaw: string; asOf?: string }>();
    for (const a of activityAll) {
      const decoded = decodedByHash.get(a.hash) ?? readDecodedCache(a.hash)?.decoded;
      const tsRaw = a.timestamp;
      const tsMs = Date.parse(tsRaw ?? "");

      const hintRows: Array<{ playerToken?: string; tokenIdDec?: string; priceUsdcPerShareRaw?: string }> = [];
      for (const trade of decoded?.trades ?? []) {
        hintRows.push({
          playerToken: trade.playerToken,
          tokenIdDec: trade.tokenIdDec,
          priceUsdcPerShareRaw: trade.priceUsdcPerShareRaw,
        });
      }

      // Fallback for tx rows that were inferred from ERC-1155 + USDC deltas.
      if (hintRows.length === 0 && a.inferred && a.inferred.kind !== "unknown") {
        hintRows.push({
          playerToken: a.inferred.contractAddress,
          tokenIdDec: a.inferred.tokenIdDec,
          priceUsdcPerShareRaw: a.inferred.priceUsdcPerShareRaw,
        });
      }

      for (const hint of hintRows) {
        if (!hint.playerToken || !hint.tokenIdDec || !hint.priceUsdcPerShareRaw) continue;
        if (!/^[0-9]+$/.test(hint.priceUsdcPerShareRaw)) continue;
        const key = tokenPriceMapKey(hint.playerToken, hint.tokenIdDec);
        const prev = latestTradePriceByKey.get(key);
        const prevMs = Date.parse(prev?.asOf ?? "");
        const shouldReplace =
          !prev ||
          (Number.isFinite(tsMs) && (!Number.isFinite(prevMs) || tsMs >= prevMs));
        if (shouldReplace) {
          latestTradePriceByKey.set(key, {
            priceUsdcRaw: hint.priceUsdcPerShareRaw,
            asOf: tsRaw,
          });
        }
      }
    }

    const seedRows: Array<{
      contractAddress: string;
      tokenIdDec: string;
      priceUsdcRaw: string;
      source: string;
      asOf?: string;
      providerPayload: unknown;
    }> = [];

    const missingHoldings = holdings.filter((h) => {
      const key = tokenPriceMapKey(h.contractAddress, h.tokenIdDec);
      return !storedPrices.has(key);
    });

    const marketPriceBySport = new Map<
      "nfl" | "soccer",
      { asOf?: string; byTokenId: Map<string, string> }
    >();

    if (missingHoldings.length > 0 && hasTime(3500)) {
      const sportsNeeded = new Set<"nfl" | "soccer">();
      for (const h of missingHoldings) {
        const sport = getSportfunSportLabel(h.contractAddress);
        if (sport === "nfl" || sport === "soccer") sportsNeeded.add(sport);
      }

      await Promise.all(
        [...sportsNeeded].map(async (sport) => {
          try {
            const snapshot = await getSportfunMarketSnapshot({
              sport,
              windowHours: 24,
              trendDays: 30,
              maxTokens: 1000,
            });
            const byTokenId = new Map<string, string>();
            for (const token of snapshot.tokens ?? []) {
              if (!token.currentPriceUsdcRaw) continue;
              if (!/^[0-9]+$/.test(token.currentPriceUsdcRaw)) continue;
              byTokenId.set(token.tokenIdDec, token.currentPriceUsdcRaw);
            }
            marketPriceBySport.set(sport, {
              asOf: snapshot.asOf,
              byTokenId,
            });
          } catch {
            // Market fallback is best-effort only.
          }
        })
      );
    }

    for (const h of holdings) {
      const key = tokenPriceMapKey(h.contractAddress, h.tokenIdDec);
      if (storedPrices.has(key)) continue;
      const hinted = latestTradePriceByKey.get(key);
      const sport = getSportfunSportLabel(h.contractAddress);
      const marketHint =
        sport === "nfl" || sport === "soccer"
          ? marketPriceBySport.get(sport)?.byTokenId.get(h.tokenIdDec)
          : undefined;
      const marketAsOf =
        sport === "nfl" || sport === "soccer"
          ? marketPriceBySport.get(sport)?.asOf
          : undefined;
      if (!hinted && !marketHint) continue;
      seedRows.push({
        contractAddress: h.contractAddress,
        tokenIdDec: h.tokenIdDec,
        priceUsdcRaw: hinted?.priceUsdcRaw ?? marketHint!,
        source: hinted ? "sportfun_trade_hint" : "sportfun_market_snapshot",
        asOf: hinted?.asOf ?? marketAsOf,
        providerPayload: {
          reason: hinted
            ? "portfolio_trade_fallback"
            : "portfolio_market_snapshot_fallback",
          ...(sport === "nfl" || sport === "soccer" ? { sport } : {}),
        },
      });
    }

    const seededKeys = new Set(seedRows.map((row) => tokenPriceMapKey(row.contractAddress, row.tokenIdDec)));
    const unresolvedByPair = new Map<string, { contractAddress: string; tokenIds: Set<string> }>();
    for (const h of holdings) {
      const key = tokenPriceMapKey(h.contractAddress, h.tokenIdDec);
      if (storedPrices.has(key) || seededKeys.has(key)) continue;
      const fdfPair = getFdfPairForPlayerToken(h.contractAddress);
      if (!fdfPair) continue;
      const entry = unresolvedByPair.get(fdfPair) ?? {
        contractAddress: h.contractAddress,
        tokenIds: new Set<string>(),
      };
      entry.tokenIds.add(h.tokenIdDec);
      unresolvedByPair.set(fdfPair, entry);
    }

    if (unresolvedByPair.size > 0 && hasTime(1800)) {
      const asOf = new Date().toISOString();
      const ONCHAIN_PRICE_BATCH_SIZE = 40;
      const ONCHAIN_PAIR_CONCURRENCY = 2;
      const ONCHAIN_MIN_TIME_MS = 1200;
      const ONCHAIN_MAX_CALLS_PER_PAIR = 120;

      await mapLimit([...unresolvedByPair.entries()], ONCHAIN_PAIR_CONCURRENCY, async ([fdfPair, group]) => {
        const tokenIds = [...group.tokenIds];
        let callsUsed = 0;

        async function fetchBatch(batchTokenIds: string[]): Promise<void> {
          if (!batchTokenIds.length) return;
          if (!hasTime(ONCHAIN_MIN_TIME_MS)) return;
          if (callsUsed >= ONCHAIN_MAX_CALLS_PER_PAIR) return;

          callsUsed += 1;
          const batchBigInt = batchTokenIds.map((id) => BigInt(id));
          try {
            const data = encodeFunctionData({
              abi: FDFPAIR_READ_ABI,
              functionName: "getPrices",
              args: [batchBigInt],
            });
            const result = (await withRetry(
              () => alchemyRpc("eth_call", [{ to: fdfPair, data }, "latest"]),
              { retries: 2, baseDelayMs: 200 }
            )) as Hex;
            const decoded = decodeFunctionResult({
              abi: FDFPAIR_READ_ABI,
              functionName: "getPrices",
              data: result,
            }) as bigint[];
            const prices = Array.isArray(decoded) ? decoded : [];
            if (prices.length !== batchTokenIds.length) {
              throw new Error("getPrices_length_mismatch");
            }

            for (let j = 0; j < batchTokenIds.length; j += 1) {
              const tokenIdDec = batchTokenIds[j];
              const price = prices[j];
              if (typeof price !== "bigint" || price <= 0n) continue;
              const key = tokenPriceMapKey(group.contractAddress, tokenIdDec);
              if (storedPrices.has(key) || seededKeys.has(key)) continue;
              seedRows.push({
                contractAddress: group.contractAddress,
                tokenIdDec,
                priceUsdcRaw: price.toString(10),
                source: "sportfun_onchain_getprices",
                asOf,
                providerPayload: {
                  reason: "portfolio_onchain_getprices_fallback",
                  fdfPair,
                },
              });
              seededKeys.add(key);
            }
          } catch {
            // Some ids can make the whole batch fail; split and retry smaller chunks.
            if (batchTokenIds.length <= 1) return;
            const mid = Math.floor(batchTokenIds.length / 2);
            if (mid <= 0 || mid >= batchTokenIds.length) return;
            await fetchBatch(batchTokenIds.slice(0, mid));
            await fetchBatch(batchTokenIds.slice(mid));
          }
        }

        for (let i = 0; i < tokenIds.length; i += ONCHAIN_PRICE_BATCH_SIZE) {
          if (!hasTime(ONCHAIN_MIN_TIME_MS)) break;
          const batchTokenIds = tokenIds.slice(i, i + ONCHAIN_PRICE_BATCH_SIZE);
          await fetchBatch(batchTokenIds);
        }
      });
    }

    if (seedRows.length > 0) {
      const written = await upsertStoredSportfunPrices(seedRows);
      if (written > 0) {
        for (const row of seedRows) {
          const key = tokenPriceMapKey(row.contractAddress, row.tokenIdDec);
          storedPrices.set(key, {
            contractAddress: row.contractAddress.toLowerCase(),
            tokenIdDec: row.tokenIdDec,
            priceUsdcRaw: BigInt(row.priceUsdcRaw),
            source: row.source,
            asOf: row.asOf,
          });
        }
      }
    }

    for (const h of holdings) {
      const key = tokenPriceMapKey(h.contractAddress, h.tokenIdDec);
      const stored = storedPrices.get(key);
      if (!stored) continue;
      const balance = BigInt(h.balanceRaw);
      const value = (stored.priceUsdcRaw * balance) / 10n ** 18n;
      priceByHoldingKey.set(key, {
        priceUsdcPerShareRaw: stored.priceUsdcRaw,
        valueUsdcRaw: value,
      });
    }
  }

  // Optional ERC-1155 `uri(tokenId)` lookups.
  const uriByKey = new Map<string, { uri?: string; error?: string }>();
  const metadataByKey = new Map<string, { metadata?: TokenMetadata; error?: string }>();
  const { template: metadataTemplate, defaultTemplate } = getSportfunAthleteMetadataDefaults();

  const shouldIncludeUri = includeUri && hasTime(1500);
  const holdingsForMetadata = metadataLimit ? holdings.slice(0, metadataLimit) : holdings;

  if (shouldIncludeUri) {
    await mapLimit(holdingsForMetadata, 8, async (h) => {
      const key = `${h.contractAddress}:${h.tokenIdHex}`;
      try {
        const now = Date.now();
        const cachedEntry = getSportfunMetadataCacheEntry(key);
        const templateChanged = Boolean(
          cachedEntry?.template && cachedEntry.template !== metadataTemplate
        );
        if (isSportfunMetadataFresh(cachedEntry, now) && !templateChanged && cachedEntry?.uri) {
          uriByKey.set(key, { uri: cachedEntry.uri });
          const meta = toTokenMetadata(cachedEntry.metadata);
          if (meta) metadataByKey.set(key, { metadata: meta });
          return;
        }

        const tokenId = BigInt(h.tokenIdHex);
        const data = encodeErc1155UriCall(tokenId);
        const result = (await withRetry(
          () => alchemyRpc("eth_call", [{ to: h.contractAddress, data }, "latest"]),
          { retries: 2, baseDelayMs: 200 }
        )) as Hex;
        const uriRaw = decodeAbiString(result);
        const candidates = buildSportfunMetadataCandidates({
          uriRaw,
          tokenId,
          template: metadataTemplate,
          defaultTemplate,
        });
        const uri = candidates[0];
        if (!uri) {
          uriByKey.set(key, { error: "No metadata URL candidates found." });
          return;
        }
        uriByKey.set(key, { uri });
        setSportfunMetadataCacheEntry(key, {
          updatedAt: now,
          uri,
          metadata: cachedEntry?.metadata ?? null,
          template: metadataTemplate,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        uriByKey.set(key, { error: msg });
      }
    });
  }

  const shouldIncludeMetadata = includeMetadata && shouldIncludeUri && hasTime(1500);
  if (shouldIncludeMetadata) {
    await mapLimit(holdingsForMetadata, 6, async (h) => {
      const key = `${h.contractAddress}:${h.tokenIdHex}`;
      if (metadataByKey.has(key)) return;
      const uri = uriByKey.get(key)?.uri;
      if (!uri) return;

      const localEntry = getSportfunMetadataCacheEntry(key);
      const templateChanged = Boolean(
        localEntry?.template && localEntry.template !== metadataTemplate
      );
      if (isSportfunMetadataFresh(localEntry) && !templateChanged && localEntry?.metadata) {
        metadataByKey.set(key, { metadata: toTokenMetadata(localEntry.metadata) });
        return;
      }

      const cached = readMetadataCache(key);
      if (cached && (!cached.template || cached.template === metadataTemplate)) {
        metadataByKey.set(key, { metadata: cached.metadata, error: cached.error });
        if (cached.metadata) {
          setSportfunMetadataCacheEntry(key, {
            updatedAt: Date.now(),
            uri,
            metadata: {
              name: cached.metadata.name,
              description: cached.metadata.description,
              image: cached.metadata.image,
            },
            template: metadataTemplate,
          });
        }
        return;
      }

      const tokenId = BigInt(h.tokenIdHex);
      const result = await resolveMetadataForToken({
        uri,
        tokenId,
        template: metadataTemplate,
        defaultTemplate,
      });
      metadataByKey.set(key, { metadata: result.metadata, error: result.error });
      if (result.resolvedUri && result.resolvedUri !== uri) {
        uriByKey.set(key, { uri: result.resolvedUri });
      }
      if (result.metadata) {
        setSportfunMetadataCacheEntry(key, {
          updatedAt: Date.now(),
          uri: result.resolvedUri ?? uri,
          metadata: {
            name: result.metadata.name,
            description: result.metadata.description,
            image: result.metadata.image,
          },
          template: metadataTemplate,
        });
      }
      writeMetadataCache(key, {
        uri: result.resolvedUri ?? uri,
        metadata: result.metadata,
        error: result.error,
        template: metadataTemplate,
      });
    });
  }

  const holdingsEnriched = holdings.map((h) => {
    const metadataKey = `${h.contractAddress}:${h.tokenIdHex}`;
    const meta = uriByKey.get(metadataKey);
    const metadata = metadataByKey.get(metadataKey);
    const overrideName = getSportfunNameOverride(h.contractAddress, h.tokenIdDec);
    const resolvedMetadata = metadata?.metadata
      ? {
          ...metadata.metadata,
          name: metadata.metadata.name ?? overrideName,
        }
      : overrideName
        ? { name: overrideName }
        : undefined;
    const priceMeta = priceByHoldingKey.get(tokenKey(h.contractAddress, h.tokenIdDec));
    return {
      ...h,
      uri: meta?.uri,
      uriError: meta?.error,
      metadata: resolvedMetadata,
      metadataError: metadata?.error,
      priceUsdcPerShareRaw: priceMeta?.priceUsdcPerShareRaw?.toString(10),
      valueUsdcRaw: priceMeta?.valueUsdcRaw?.toString(10),
    };
  });

  function enrichActivityRow(
    a: ActivityItem,
    cachedDecoded?: ReceiptDecodedCache | null
  ): ActivityEnrichedItem {
    const decodedFromReceipt = decodedByHash.get(a.hash) ?? cachedDecoded?.decoded;
    const renewalsFromLogs = contractRenewalsByHash.get(a.hash) ?? [];
    const packFromSelector = packOpensByHash.get(a.hash) ?? [];
    const depositsFromTransfers = depositsByHash.get(a.hash) ?? [];
    const scamsFromTransfers = scamsByHash.get(a.hash) ?? [];
    const mergedRenewals = dedupeContractRenewals([
      ...renewalsFromLogs,
      ...(decodedFromReceipt?.contractRenewals ?? []),
    ]);
    const mergedPackOpens = [...packFromSelector, ...(decodedFromReceipt?.packOpens ?? [])];
    const mergedDeposits = dedupeDeposits(
      depositsFromTransfers.length ? depositsFromTransfers : (decodedFromReceipt?.deposits ?? [])
    );
    const mergedScams = dedupeScamItems([
      ...scamsFromTransfers,
      ...(decodedFromReceipt?.scams ?? []),
    ]);

    const usdcDeltaFromMemory = usdcDeltaReceiptByHash.get(a.hash);
    const usdcDeltaFromCache =
      usdcDeltaFromMemory === undefined
        ? cachedDecoded?.usdcDeltaReceipt
          ? BigInt(cachedDecoded.usdcDeltaReceipt)
          : null
        : usdcDeltaFromMemory;
    const effectiveUsdcDelta = usdcDeltaFromMemory ?? usdcDeltaFromCache ?? BigInt(a.usdcDeltaRaw);

    const reconciledTrades = reconcileTradeUsdcWithReceipt({
      trades: decodedFromReceipt?.trades ?? [],
      renewals: mergedRenewals,
      deposits: mergedDeposits,
      effectiveUsdcDelta,
    });
    const reconciledPackOpens = reconcilePackOpenUsdcWithReceipt({
      packOpens: mergedPackOpens,
      trades: reconciledTrades,
      renewals: mergedRenewals,
      deposits: mergedDeposits,
      effectiveUsdcDelta,
    });

    const decoded =
      decodedFromReceipt ||
      mergedRenewals.length ||
      mergedPackOpens.length ||
      mergedDeposits.length ||
      mergedScams.length
        ? {
            trades: reconciledTrades,
            promotions: decodedFromReceipt?.promotions ?? [],
            contractRenewals: mergedRenewals,
            packOpens: reconciledPackOpens,
            deposits: mergedDeposits,
            scams: mergedScams,
            unknownSportfunTopics: decodedFromReceipt?.unknownSportfunTopics ?? [],
          }
        : undefined;

    // If we have decoded trades, treat them as primary classification.
    const primaryKind = decoded?.scams?.length
      ? "scam"
      : decoded?.trades?.length
        ? decoded.trades.every((t) => t.kind === "buy")
          ? "buy"
          : decoded.trades.every((t) => t.kind === "sell")
            ? "sell"
            : "unknown"
        : a.inferred?.kind ?? "unknown";

    return {
      ...a,
      usdcDeltaRaw: effectiveUsdcDelta.toString(10),
      kind: primaryKind,
      decoded: decoded
        ? {
            trades: decoded.trades,
            promotions: decoded.promotions,
            contractRenewals: decoded.contractRenewals,
            packOpens: decoded.packOpens,
            deposits: decoded.deposits,
            scams: decoded.scams,
            unknownSportfunTopics: decoded.unknownSportfunTopics,
          }
        : undefined,
      receipt: includeReceipts ? receiptByHash.get(a.hash) : undefined,
    };
  }

  // Attach decoded payload to current page activity; ledger uses full activityAll.
  const pageHashes = new Set(activity.map((a) => a.hash));
  let activityEnriched: ActivityEnrichedItem[] = activity.map((a) => enrichActivityRow(a));
  const pageBaseByHash = new Map(activityEnriched.map((a) => [a.hash, a]));
  const ledgerOnlyActivity: ActivityEnrichedItem[] = activityAll
    .filter((a) => !pageHashes.has(a.hash))
    .map((a) => enrichActivityRow(a, readDecodedCache(a.hash)));
  const activityForLedgerBase = [...activityEnriched, ...ledgerOnlyActivity];

  // Reconcile: if decoded events don't fully explain the ERC-1155 delta,
  // add synthetic transfer_in/transfer_out ops (zero cost / unknown provenance).
  let shareDeltaMismatchCount = 0;
  let shareDeltaMismatchTxCount = 0;
  const shareDeltaMismatchSamples: Array<{
    hash: string;
    contractAddress: string;
    tokenIdDec: string;
    expectedDeltaRaw: string;
    decodedDeltaRaw: string;
    residualDeltaRaw: string;
    reason: "erc1155_unexplained_delta";
  }> = [];

  const activityEnrichedForLedger: ActivityEnrichedItem[] = activityForLedgerBase.map((a) => {
    const decoded = a.decoded;

    const expectedByKey = new Map<string, bigint>();
    for (const c of a.erc1155Changes) {
      expectedByKey.set(tokenKey(c.contractAddress, c.tokenIdDec), BigInt(c.deltaRaw));
    }

    const decodedByKey = new Map<string, bigint>();
    for (const t of decoded?.trades ?? []) {
      if (!t.playerToken) continue;
      const key = tokenKey(t.playerToken, t.tokenIdDec);
      decodedByKey.set(key, (decodedByKey.get(key) ?? 0n) + BigInt(t.walletShareDeltaRaw));
    }
    for (const p of decoded?.promotions ?? []) {
      if (!p.playerToken) continue;
      const key = tokenKey(p.playerToken, p.tokenIdDec);
      decodedByKey.set(key, (decodedByKey.get(key) ?? 0n) + BigInt(p.walletShareDeltaRaw));
    }
    for (const p of decoded?.packOpens ?? []) {
      const key = tokenKey(p.playerToken, p.tokenIdDec);
      decodedByKey.set(key, (decodedByKey.get(key) ?? 0n) + BigInt(p.shareAmountRaw));
    }

    // `inferred` is derived from raw deltas and should count as explained delta to
    // prevent double counting with reconciledTransfers.
    if ((!decoded?.trades?.length || decoded.trades.length === 0) && a.inferred && a.inferred.kind !== "unknown") {
      try {
        if (a.inferred.contractAddress && a.inferred.tokenIdDec && a.inferred.shareDeltaRaw) {
          const key = tokenKey(a.inferred.contractAddress, a.inferred.tokenIdDec);
          const delta = BigInt(a.inferred.shareDeltaRaw);
          decodedByKey.set(key, (decodedByKey.get(key) ?? 0n) + delta);
        }
      } catch {
        // ignore malformed inferred rows
      }
    }

    const reconciledTransfers: ReconciledTransfer[] = [];

    // We treat ERC-1155 deltas as the source of truth for holdings.
    for (const [key, expectedDelta] of expectedByKey.entries()) {
      const decodedDelta = decodedByKey.get(key) ?? 0n;
      if (decodedDelta === expectedDelta) continue;

      const residual = expectedDelta - decodedDelta;
      if (residual === 0n) continue;

      const [contractAddress, tokenIdDec] = key.split(":");
      reconciledTransfers.push({
        kind: residual > 0n ? "transfer_in" : "transfer_out",
        contractAddress,
        tokenIdDec,
        deltaRaw: residual.toString(10),
        note: "unknown",
        reason: "erc1155_unexplained_delta",
      });

      shareDeltaMismatchCount++;
      if (shareDeltaMismatchSamples.length < 8) {
        shareDeltaMismatchSamples.push({
          hash: a.hash,
          contractAddress,
          tokenIdDec,
          expectedDeltaRaw: expectedDelta.toString(10),
          decodedDeltaRaw: decodedDelta.toString(10),
          residualDeltaRaw: residual.toString(10),
          reason: "erc1155_unexplained_delta",
        });
      }
    }

    if (reconciledTransfers.length) shareDeltaMismatchTxCount++;

    return {
      ...a,
      reconciledTransfers: reconciledTransfers.length ? reconciledTransfers : undefined,
    };
  });

  const reconciledByHash = new Map(activityEnrichedForLedger.map((a) => [a.hash, a]));
  activityEnriched = activity.map((a) => {
    const enriched = reconciledByHash.get(a.hash) ?? pageBaseByHash.get(a.hash);
    if (!enriched) return enrichActivityRow(a, readDecodedCache(a.hash));
    return enriched;
  });

  // Portfolio analytics (moving average cost basis, per tokenId).
  // NOTE: This is wallet-centric and uses decoded trade flows when available.
  // If decoding is incomplete, we reconcile to on-chain ERC-1155 deltas via synthetic transfers.
  type LedgerItem =
    | ({ itemKind: "trade" } & DecodedTradeItem & { txHash: string; timestamp?: string })
    | ({ itemKind: "promotion" } & DecodedPromotionItem & { txHash: string; timestamp?: string })
    | ({ itemKind: "contract_renewal" } & DecodedContractRenewalItem & { txHash: string; timestamp?: string })
    | ({ itemKind: "pack_open" } & DecodedPackOpenItem & { txHash: string; timestamp?: string })
    | {
        itemKind: "inferred_trade";
        kind: "buy" | "sell";
        playerToken: string;
        tokenIdDec: string;
        walletShareDeltaRaw: string;
        walletCurrencyDeltaRaw: string;
        txHash: string;
        timestamp?: string;
      }
    | {
        itemKind: "transfer";
        transferKind: "transfer_in" | "transfer_out";
        reason: "erc1155_unexplained_delta";
        note: "unknown";
        playerToken: string;
        tokenIdDec: string;
        walletShareDeltaRaw: string;
        walletCurrencyDeltaRaw: "0";
        txHash: string;
        timestamp?: string;
      };

  const ledger: LedgerItem[] = [];
  let decodedTradeCount = 0;
  let decodedPromotionCount = 0;
  let decodedContractRenewalCount = 0;
  let decodedPackOpenCount = 0;
  let decodedDepositCount = 0;
  let decodedScamCount = 0;
  let depositToGameWalletUsdcRaw = 0n;
  let depositFromGameWalletUsdcRaw = 0n;
  let funIncomingRaw = 0n;
  let funOutgoingRaw = 0n;

  for (const a of activityEnrichedForLedger) {
    const funDelta = BigInt(a.funDeltaRaw ?? "0");
    if (funDelta > 0n) funIncomingRaw += funDelta;
    if (funDelta < 0n) funOutgoingRaw += -funDelta;

    const decoded = a.decoded;

    decodedTradeCount += decoded?.trades?.length ?? 0;
    decodedPromotionCount += decoded?.promotions?.length ?? 0;
    decodedContractRenewalCount += decoded?.contractRenewals?.length ?? 0;
    decodedPackOpenCount += decoded?.packOpens?.length ?? 0;
    decodedDepositCount += decoded?.deposits?.length ?? 0;
    decodedScamCount += decoded?.scams?.length ?? 0;

    for (const t of decoded?.trades ?? []) {
      ledger.push({ itemKind: "trade", ...t, txHash: a.hash, timestamp: a.timestamp });
    }

    for (const p of decoded?.promotions ?? []) {
      ledger.push({ itemKind: "promotion", ...p, txHash: a.hash, timestamp: a.timestamp });
    }

    for (const r of decoded?.contractRenewals ?? []) {
      const resolvedPlayerToken = r.playerToken ?? resolvePlayerTokenByTokenId(r.tokenIdDec);
      if (resolvedPlayerToken) addTokenContractCandidate(r.tokenIdDec, resolvedPlayerToken);
      ledger.push({
        itemKind: "contract_renewal",
        ...r,
        playerToken: resolvedPlayerToken ?? r.playerToken,
        txHash: a.hash,
        timestamp: a.timestamp,
      });
    }

    for (const p of decoded?.packOpens ?? []) {
      ledger.push({ itemKind: "pack_open", ...p, txHash: a.hash, timestamp: a.timestamp });
    }

    for (const d of decoded?.deposits ?? []) {
      const amount = BigInt(d.amountRaw);
      if (amount <= 0n) continue;
      if (d.direction === "to_game_wallet") depositToGameWalletUsdcRaw += amount;
      if (d.direction === "from_game_wallet") depositFromGameWalletUsdcRaw += amount;
    }

    if (!decoded?.trades?.length && a.inferred?.kind && a.inferred.kind !== "unknown") {
      if (a.inferred.contractAddress && a.inferred.tokenIdDec && a.inferred.shareDeltaRaw) {
        ledger.push({
          itemKind: "inferred_trade",
          kind: a.inferred.kind,
          playerToken: a.inferred.contractAddress,
          tokenIdDec: a.inferred.tokenIdDec,
          walletShareDeltaRaw: a.inferred.shareDeltaRaw,
          walletCurrencyDeltaRaw: a.usdcDeltaRaw,
          txHash: a.hash,
          timestamp: a.timestamp,
        });
      }
    }

    for (const r of a.reconciledTransfers ?? []) {
      ledger.push({
        itemKind: "transfer",
        transferKind: r.kind,
        reason: r.reason,
        note: r.note,
        playerToken: r.contractAddress,
        tokenIdDec: r.tokenIdDec,
        walletShareDeltaRaw: r.deltaRaw,
        walletCurrencyDeltaRaw: "0",
        txHash: a.hash,
        timestamp: a.timestamp,
      });
    }
  }

  ledger.sort((a, b) => String(a.timestamp ?? "").localeCompare(String(b.timestamp ?? "")));

  const positionByKey = new Map<
    string,
    { shares: bigint; costUsdc: bigint; promoShares: bigint; freeShares: bigint }
  >();
  const makeFlow = () => ({
    boughtShares: 0n,
    soldShares: 0n,
    spentUsdc: 0n,
    receivedUsdc: 0n,
    freeSharesIn: 0n,
    freeEvents: 0,
    promotionSharesIn: 0n,
    promotionEvents: 0,
    packOpenSharesIn: 0n,
    packOpenEvents: 0,
    contractRenewalSpentUsdc: 0n,
    contractRenewalEvents: 0,
  });

  // Per-athlete aggregates from decoded on-chain flows.
  // NOTE: These are computed from the same (possibly truncated) ledger as cost basis.
  const flowByKey = new Map<
    string,
    {
      boughtShares: bigint;
      soldShares: bigint;
      spentUsdc: bigint;
      receivedUsdc: bigint;
      freeSharesIn: bigint;
      freeEvents: number;
      promotionSharesIn: bigint;
      promotionEvents: number;
      packOpenSharesIn: bigint;
      packOpenEvents: number;
      contractRenewalSpentUsdc: bigint;
      contractRenewalEvents: number;
    }
  >();

  let realizedPnlUsdcRaw = 0n;
  let realizedPnlEconomicUsdcRaw = 0n;
  let costBasisUnknownTradeCount = 0;
  let giftBuyCount = 0;
  let sellNoProceedsCount = 0;
  let reconciledTransferInCount = 0;
  let reconciledTransferOutCount = 0;
  let contractRenewalSpentUsdcRaw = 0n;
  let contractRenewalAppliedCount = 0;
  let contractRenewalUnresolvedCount = 0;
  let contractRenewalNoSharesCount = 0;
  let contractRenewalUnsupportedPaymentCount = 0;
  let packOpenFreeSharesRaw = 0n;

  for (const item of ledger) {
    if (item.itemKind === "contract_renewal") {
      const amountPaid = BigInt(item.amountPaidRaw);
      if (amountPaid <= 0n) continue;
      if (item.paymentToken !== BASE_USDC) {
        contractRenewalUnsupportedPaymentCount++;
        continue;
      }
      if (!item.playerToken) {
        contractRenewalUnresolvedCount++;
        continue;
      }

      const key = tokenKey(item.playerToken, item.tokenIdDec);
      const pos = positionByKey.get(key) ?? { shares: 0n, costUsdc: 0n, promoShares: 0n, freeShares: 0n };
      const flow = flowByKey.get(key) ?? makeFlow();

      flow.spentUsdc += amountPaid;
      flow.contractRenewalSpentUsdc += amountPaid;
      flow.contractRenewalEvents++;
      contractRenewalSpentUsdcRaw += amountPaid;
      contractRenewalAppliedCount++;

      // If the wallet currently has tracked shares, renewal fee increases that athlete's basis.
      // Otherwise treat it as immediate realized expense to avoid silently dropping the cost.
      if (pos.shares > 0n) {
        pos.costUsdc += amountPaid;
      } else {
        realizedPnlUsdcRaw -= amountPaid;
        realizedPnlEconomicUsdcRaw -= amountPaid;
        contractRenewalNoSharesCount++;
      }

      positionByKey.set(key, pos);
      flowByKey.set(key, flow);
      continue;
    }

    const playerToken = item.playerToken;
    if (!playerToken) continue;

    const shareDelta =
      item.itemKind === "pack_open" ? BigInt(item.shareAmountRaw) : BigInt(item.walletShareDeltaRaw);
    if (shareDelta === 0n) continue;

    const key = tokenKey(playerToken, item.tokenIdDec);
    const pos = positionByKey.get(key) ?? { shares: 0n, costUsdc: 0n, promoShares: 0n, freeShares: 0n };

    const flow = flowByKey.get(key) ?? makeFlow();

    if (item.itemKind === "pack_open") {
      if (shareDelta > 0n) {
        pos.shares += shareDelta;
        const packCurrencyDelta = BigInt(item.walletCurrencyDeltaRaw ?? "0");
        if (packCurrencyDelta < 0n) {
          const paid = -packCurrencyDelta;
          pos.costUsdc += paid;
          flow.spentUsdc += paid;
          flow.boughtShares += shareDelta;
        } else {
          pos.freeShares += shareDelta;
          flow.freeSharesIn += shareDelta;
          flow.freeEvents++;
          packOpenFreeSharesRaw += shareDelta;
          if (packCurrencyDelta > 0n) {
            flow.receivedUsdc += packCurrencyDelta;
          }
        }
        flow.packOpenSharesIn += shareDelta;
        flow.packOpenEvents++;
      }

      flowByKey.set(key, flow);
      positionByKey.set(key, pos);
      continue;
    }

    if (item.itemKind === "promotion") {
      // Promotions are treated as free shares (cost = 0). This adjusts average cost per
      // share and improves unrealized PnL accuracy when promotions occurred.
      if (shareDelta > 0n) {
        pos.shares += shareDelta;
        pos.promoShares += shareDelta;
        pos.freeShares += shareDelta;
        flow.freeSharesIn += shareDelta;
        flow.freeEvents++;
        flow.promotionSharesIn += shareDelta;
        flow.promotionEvents++;
      } else {
        // Defensive: handle negative deltas (should be rare/unexpected for promotions).
        const removed = -shareDelta;
        if (pos.shares > 0n) {
          const removedClamped = removed > pos.shares ? pos.shares : removed;
          const promoRemoved = proportionalRemoval(pos.promoShares, pos.shares, removedClamped);
          const freeRemoved = proportionalRemoval(pos.freeShares, pos.shares, removedClamped);
          pos.promoShares -= promoRemoved;
          pos.freeShares -= freeRemoved;
          const avgCostPerShare = (pos.costUsdc * 10n ** 18n) / pos.shares;
          const costBasisRemoved = (avgCostPerShare * removedClamped) / 10n ** 18n;
          pos.shares -= removedClamped;
          pos.costUsdc -= costBasisRemoved;
        }
      }

      flowByKey.set(key, flow);
      positionByKey.set(key, pos);
      continue;
    }

    if (item.itemKind === "transfer") {
      // Synthetic transfer used to reconcile decoded flows to on-chain ERC-1155 deltas.
      // Treated as unknown provenance and zero cost.
      if (shareDelta > 0n) {
        pos.shares += shareDelta;
        pos.freeShares += shareDelta;
        flow.freeSharesIn += shareDelta;
        flow.freeEvents++;
        reconciledTransferInCount++;
      } else {
        const removed = -shareDelta;
        if (pos.shares > 0n) {
          const removedClamped = removed > pos.shares ? pos.shares : removed;
          const promoRemoved = proportionalRemoval(pos.promoShares, pos.shares, removedClamped);
          const freeRemoved = proportionalRemoval(pos.freeShares, pos.shares, removedClamped);
          pos.promoShares -= promoRemoved;
          pos.freeShares -= freeRemoved;
          const avgCostPerShare = (pos.costUsdc * 10n ** 18n) / pos.shares;
          const costBasisRemoved = (avgCostPerShare * removedClamped) / 10n ** 18n;
          pos.shares -= removedClamped;
          pos.costUsdc -= costBasisRemoved;
        }
        reconciledTransferOutCount++;
      }

      flowByKey.set(key, flow);
      positionByKey.set(key, pos);
      continue;
    }

    const currencyDelta = BigInt(item.walletCurrencyDeltaRaw);
    const isDecodedTrade = item.itemKind === "trade";

    if (shareDelta > 0n) {
      // Buy.
      pos.shares += shareDelta;
      flow.boughtShares += shareDelta;

      if (currencyDelta < 0n) {
        // Wallet paid (including fee).
        pos.costUsdc += -currencyDelta;
        flow.spentUsdc += -currencyDelta;
      } else {
        // Wallet received shares without paying (gift) OR we failed to map the cost.
        if (item.itemKind === "trade") {
          const initiator = item.counterparty?.initiator ?? "";
          const recipient = item.counterparty?.recipient ?? "";
          const isGift = recipient === walletLc && initiator !== walletLc;

          if (isGift) {
            giftBuyCount++;
            // Gifted trade shares are zero-cost for this wallet and must be treated as free.
            pos.freeShares += shareDelta;
            flow.freeSharesIn += shareDelta;
            flow.freeEvents++;
          } else {
            costBasisUnknownTradeCount++;
          }
        } else {
          costBasisUnknownTradeCount++;
        }
      }
    } else {
      // Sell.
      const sold = -shareDelta;
      flow.soldShares += sold;

      if (pos.shares > 0n) {
        const soldClamped = sold > pos.shares ? pos.shares : sold;
        const promoSold = proportionalRemoval(pos.promoShares, pos.shares, soldClamped);
        const freeSold = proportionalRemoval(pos.freeShares, pos.shares, soldClamped);
        pos.promoShares -= promoSold;
        pos.freeShares -= freeSold;
        const avgCostPerShare = (pos.costUsdc * 10n ** 18n) / pos.shares;
        const costBasisSold = (avgCostPerShare * soldClamped) / 10n ** 18n;

        pos.shares -= soldClamped;
        pos.costUsdc -= costBasisSold;

        if (currencyDelta > 0n) {
          realizedPnlUsdcRaw += currencyDelta - costBasisSold;
          flow.receivedUsdc += currencyDelta;
        } else {
          // Proceeds may have been redirected to another recipient.
          sellNoProceedsCount++;
        }

        if (isDecodedTrade) {
          const economicProceeds = BigInt(item.currencyRaw);
          if (economicProceeds > 0n) {
            realizedPnlEconomicUsdcRaw += economicProceeds - costBasisSold;
          }
        }
      }
    }

    flowByKey.set(key, flow);
    positionByKey.set(key, pos);
  }

  // Total portfolio value (priced holdings).
  let currentValueAllHoldingsUsdcRaw = 0n;
  let holdingsPricedCount = 0;
  for (const h of holdings) {
    const priceMeta = priceByHoldingKey.get(tokenKey(h.contractAddress, h.tokenIdDec));
    if (!priceMeta) continue;
    holdingsPricedCount++;
    currentValueAllHoldingsUsdcRaw += priceMeta.valueUsdcRaw;
  }

  // Tracked positions: cost basis and unrealized PnL are computed from the ledger
  // (decoded trades/promotions + synthetic transfers used to reconcile ERC-1155 deltas).
  let currentValueUsdcRaw = 0n;
  let unrealizedPnlUsdcRaw = 0n;
  let currentValueExcludingPromotionsUsdcRaw = 0n;
  let unrealizedPnlExcludingPromotionsUsdcRaw = 0n;
  let currentValueExcludingFreeUsdcRaw = 0n;
  let unrealizedPnlExcludingFreeUsdcRaw = 0n;
  let totalCostBasisUsdcRaw = 0n;

  for (const [key, pos] of positionByKey.entries()) {
    totalCostBasisUsdcRaw += pos.costUsdc;

    const priceMeta = priceByHoldingKey.get(key);
    if (!priceMeta) continue;

    const value = priceMeta.valueUsdcRaw;
    currentValueUsdcRaw += value;
    unrealizedPnlUsdcRaw += value - pos.costUsdc;

    const promoSharesHeld = pos.promoShares > pos.shares ? pos.shares : pos.promoShares;
    const trackedSharesExcludingPromotions =
      pos.shares > promoSharesHeld ? pos.shares - promoSharesHeld : 0n;
    const valueExcludingPromotions =
      (priceMeta.priceUsdcPerShareRaw * trackedSharesExcludingPromotions) / 10n ** 18n;
    currentValueExcludingPromotionsUsdcRaw += valueExcludingPromotions;
    unrealizedPnlExcludingPromotionsUsdcRaw += valueExcludingPromotions - pos.costUsdc;

    const freeSharesHeld = pos.freeShares > pos.shares ? pos.shares : pos.freeShares;
    const trackedSharesExcludingFree = pos.shares > freeSharesHeld ? pos.shares - freeSharesHeld : 0n;
    const valueExcludingFree = (priceMeta.priceUsdcPerShareRaw * trackedSharesExcludingFree) / 10n ** 18n;
    currentValueExcludingFreeUsdcRaw += valueExcludingFree;
    unrealizedPnlExcludingFreeUsdcRaw += valueExcludingFree - pos.costUsdc;
  }

  const tpNamesBySport = new Map<SportfunTournamentTpSport, Set<string>>();
  for (const h of holdingsEnriched) {
    const tpSport = getTournamentTpSport(h.contractAddress);
    if (!tpSport) continue;
    const name = h.metadata?.name ?? getSportfunNameOverride(h.contractAddress, h.tokenIdDec);
    if (!name) continue;
    const bucket = tpNamesBySport.get(tpSport) ?? new Set<string>();
    bucket.add(name);
    tpNamesBySport.set(tpSport, bucket);
  }

  const [nflTpRows, footballTpRows] = await Promise.all([
    (async () => {
      const names = [...(tpNamesBySport.get("nfl") ?? new Set<string>())];
      if (!names.length) return [] as SportfunTournamentTpLookupRow[];
      return getSportfunTournamentTpRowsByAthleteNames({
        sport: "nfl",
        athleteNames: names,
      });
    })(),
    (async () => {
      const names = [...(tpNamesBySport.get("football") ?? new Set<string>())];
      if (!names.length) return [] as SportfunTournamentTpLookupRow[];
      return getSportfunTournamentTpRowsByAthleteNames({
        sport: "football",
        athleteNames: names,
      });
    })(),
  ]);

  const tpAggregateBySport = new Map<SportfunTournamentTpSport, Map<string, PositionTournamentTpAggregate>>([
    ["nfl", buildTournamentTpAggregateByName(nflTpRows)],
    ["football", buildTournamentTpAggregateByName(footballTpRows)],
  ]);

  const positionsByToken = holdingsEnriched
    .map((h) => {
      const key = tokenKey(h.contractAddress, h.tokenIdDec);
      const playerName = h.metadata?.name ?? getSportfunNameOverride(h.contractAddress, h.tokenIdDec);
      const tpSport = getTournamentTpSport(h.contractAddress);
      const normalizedPlayerName = normalizeSportfunAthleteName(playerName);
      const tpAggregate =
        tpSport && normalizedPlayerName
          ? tpAggregateBySport.get(tpSport)?.get(normalizedPlayerName)
          : undefined;

      const holdingShares = BigInt(h.balanceRaw);
      const tracked = positionByKey.get(key);
      const trackedShares = tracked?.shares ?? 0n;
      const trackedCostUsdc = tracked?.costUsdc ?? 0n;
      const promoSharesHeld = tracked?.promoShares ?? 0n;
      const freeSharesHeld = tracked?.freeShares ?? 0n;
      const trackedSharesExcludingPromotions =
        trackedShares > promoSharesHeld ? trackedShares - promoSharesHeld : 0n;
      const trackedSharesExcludingFree = trackedShares > freeSharesHeld ? trackedShares - freeSharesHeld : 0n;

      const priceMeta = priceByHoldingKey.get(key);
      const currentPriceUsdcPerShare = priceMeta?.priceUsdcPerShareRaw;
      const currentValueHoldingUsdc = priceMeta?.valueUsdcRaw;
      const currentValueTrackedUsdc = currentPriceUsdcPerShare
        ? (currentPriceUsdcPerShare * trackedShares) / 10n ** 18n
        : null;
      const currentValueTrackedExcludingPromotionsUsdc = currentPriceUsdcPerShare
        ? (currentPriceUsdcPerShare * trackedSharesExcludingPromotions) / 10n ** 18n
        : null;
      const currentValueTrackedExcludingFreeUsdc = currentPriceUsdcPerShare
        ? (currentPriceUsdcPerShare * trackedSharesExcludingFree) / 10n ** 18n
        : null;

      const avgCostUsdcPerShareRaw =
        trackedShares > 0n ? (trackedCostUsdc * 10n ** 18n) / trackedShares : null;

      const unrealizedPnlTrackedUsdcRaw =
        currentValueTrackedUsdc !== null ? currentValueTrackedUsdc - trackedCostUsdc : null;
      const unrealizedPnlTrackedExcludingPromotionsUsdcRaw =
        currentValueTrackedExcludingPromotionsUsdc !== null
          ? currentValueTrackedExcludingPromotionsUsdc - trackedCostUsdc
          : null;
      const unrealizedPnlTrackedExcludingFreeUsdcRaw =
        currentValueTrackedExcludingFreeUsdc !== null
          ? currentValueTrackedExcludingFreeUsdc - trackedCostUsdc
          : null;

      const flow = flowByKey.get(key);

      return {
        playerToken: h.contractAddress,
        tokenIdDec: h.tokenIdDec,
        playerName,

        holdingSharesRaw: holdingShares.toString(10),
        trackedSharesRaw: trackedShares.toString(10),
        promoSharesHeldRaw: promoSharesHeld.toString(10),
        freeSharesHeldRaw: freeSharesHeld.toString(10),
        trackedSharesExcludingPromotionsRaw: trackedSharesExcludingPromotions.toString(10),
        trackedSharesExcludingFreeRaw: trackedSharesExcludingFree.toString(10),

        costBasisUsdcRaw: trackedCostUsdc.toString(10),
        avgCostUsdcPerShareRaw: avgCostUsdcPerShareRaw?.toString(10),

        currentPriceUsdcPerShareRaw: currentPriceUsdcPerShare?.toString(10),
        currentValueHoldingUsdcRaw: currentValueHoldingUsdc?.toString(10),
        currentValueTrackedUsdcRaw: currentValueTrackedUsdc?.toString(10),
        currentValueTrackedExcludingPromotionsUsdcRaw:
          currentValueTrackedExcludingPromotionsUsdc?.toString(10),
        currentValueTrackedExcludingFreeUsdcRaw: currentValueTrackedExcludingFreeUsdc?.toString(10),

        unrealizedPnlTrackedUsdcRaw: unrealizedPnlTrackedUsdcRaw?.toString(10),
        unrealizedPnlTrackedExcludingPromotionsUsdcRaw:
          unrealizedPnlTrackedExcludingPromotionsUsdcRaw?.toString(10),
        unrealizedPnlTrackedExcludingFreeUsdcRaw:
          unrealizedPnlTrackedExcludingFreeUsdcRaw?.toString(10),

        averageTpPerTournament: tpAggregate?.averageTpPerTournament,
        tournamentsCount: tpAggregate?.tournamentsCount,
        tournamentTpTotal: tpAggregate?.tournamentTpTotal,
        tpLastTournamentAt: tpAggregate?.lastTournamentAt,

        totals: flow
          ? {
              boughtSharesRaw: flow.boughtShares.toString(10),
              soldSharesRaw: flow.soldShares.toString(10),
              spentUsdcRaw: flow.spentUsdc.toString(10),
              receivedUsdcRaw: flow.receivedUsdc.toString(10),
              freeSharesInRaw: flow.freeSharesIn.toString(10),
              freeEvents: flow.freeEvents,
              promotionSharesInRaw: flow.promotionSharesIn.toString(10),
              promotionEvents: flow.promotionEvents,
              packOpenSharesInRaw: flow.packOpenSharesIn.toString(10),
              packOpenEvents: flow.packOpenEvents,
              contractRenewalSpentUsdcRaw: flow.contractRenewalSpentUsdc.toString(10),
              contractRenewalEvents: flow.contractRenewalEvents,
            }
          : undefined,
      };
    })
    .sort((a, b) => {
      const av = BigInt(a.currentValueHoldingUsdcRaw ?? "0");
      const bv = BigInt(b.currentValueHoldingUsdcRaw ?? "0");
      if (bv === av) return 0;
      return bv > av ? 1 : -1;
    });

  const payload = {
    chain: "base",
    protocol: "sportfun",
    address: wallet,
    query: {
      scanMode,
      maxPages,
      maxCount,
      maxActivity,
      includeTrades,
      includePrices,
      includeReceipts,
      includeUri,
      includeMetadata,
      metadataLimit,
    },
    assumptions: {
      shareUnits: "Player share amounts are treated as 18-dec fixed-point (1e18 = 1 share).",
      knownContracts: SPORTFUN_ERC1155_CONTRACTS,
      fdfPairs: SPORTFUN_FDF_PAIR_CONTRACTS,
      allowedGameWalletTokens: {
        usdc: BASE_USDC,
        fun: SPORTFUN_FUN_TOKEN_ADDRESS,
      },
      depositCounterparties: [...depositCounterparties],
      usdc: {
        contractAddress: BASE_USDC,
        decimals: BASE_USDC_DECIMALS,
        note: "USDC delta is computed from receipt Transfer logs when available; trade rows come from FDFPairV2 events and are receipt-reconciled when needed.",
      },
    },
    summary: {
      erc1155TransferCount: erc1155Transfers.length,
      sportfunErc1155TransferCount: erc1155Transfers.filter((t) => {
        const c = toLower(t.rawContract?.address);
        return c ? isOneOf(c, SPORTFUN_ERC1155_CONTRACTS) : false;
      }).length,
      contractCount: contractSet.size,
      holdingCount: holdingsEnriched.length,
      // Backwards-compatible field used by the UI.
      activityCount: activityAll.length,
      // Additional fields (new).
      activityCountTotal: activityAll.length,
      activityCountReturned: activityEnriched.length,
      activityTruncated,
      nextActivityCursor,
      activityCursor: activityOffset,
      decodedTradeCount,
      decodedPromotionCount,
      decodedContractRenewalCount,
      decodedPackOpenCount,
      funTransferCount: funTransfers.length,
      decodedDepositCount,
      decodedScamCount,
      // Count of (contract, tokenId) deltas where decoded trades/promotions didn't match ERC-1155 deltas.
      // These are reconciled via synthetic transfer_in/transfer_out ledger ops.
      shareDeltaMismatchCount,
      shareDeltaMismatchTxCount,
      reconciledTransferInCount,
      reconciledTransferOutCount,
      scanTruncatedByBudget,
      scanIncomplete,
      scan,
      scanStart: {
        fromBlock: scanStartBlock,
        fromDate: SCAN_START_DATE_ISO,
      },
    },
    holdings: holdingsEnriched,
    activity: activityEnriched,
    analytics: {
      realizedPnlUsdcRaw: realizedPnlUsdcRaw.toString(10),
      realizedPnlEconomicUsdcRaw: realizedPnlEconomicUsdcRaw.toString(10),
      unrealizedPnlUsdcRaw: unrealizedPnlUsdcRaw.toString(10),
      unrealizedPnlExcludingPromotionsUsdcRaw: unrealizedPnlExcludingPromotionsUsdcRaw.toString(10),
      unrealizedPnlExcludingFreeUsdcRaw: unrealizedPnlExcludingFreeUsdcRaw.toString(10),
      totalCostBasisUsdcRaw: totalCostBasisUsdcRaw.toString(10),
      // Value of positions that have a computed cost basis (decoded trades/promotions).
      currentValueUsdcRaw: currentValueUsdcRaw.toString(10),
      currentValueExcludingPromotionsUsdcRaw: currentValueExcludingPromotionsUsdcRaw.toString(10),
      currentValueExcludingFreeUsdcRaw: currentValueExcludingFreeUsdcRaw.toString(10),
      // Value of all priced holdings (independent of cost basis tracking).
      currentValueAllHoldingsUsdcRaw: currentValueAllHoldingsUsdcRaw.toString(10),
      holdingsPricedCount,
      costBasisUnknownTradeCount,
      giftBuyCount,
      sellNoProceedsCount,
      reconciledTransferInCount,
      reconciledTransferOutCount,
      contractRenewalSpentUsdcRaw: contractRenewalSpentUsdcRaw.toString(10),
      contractRenewalAppliedCount,
      contractRenewalUnresolvedCount,
      contractRenewalNoSharesCount,
      contractRenewalUnsupportedPaymentCount,
      packOpenFreeSharesRaw: packOpenFreeSharesRaw.toString(10),
      depositToGameWalletUsdcRaw: depositToGameWalletUsdcRaw.toString(10),
      depositFromGameWalletUsdcRaw: depositFromGameWalletUsdcRaw.toString(10),
      funIncomingRaw: funIncomingRaw.toString(10),
      funOutgoingRaw: funOutgoingRaw.toString(10),
      positionsByToken: positionsByToken,
      note: "PnL is a WIP: cost basis is tracked from decoded FDFPair trades (moving average). Promotions and reconciled transfers add free shares (zero cost). Pack open USDC cost is inferred from tx-level receipt deltas after accounting for trades/renewals/deposits; when no residual USDC remains, pack rows are treated as free. ContractRenewed events (USDC) are included as athlete-specific costs when token mapping is unambiguous; unresolved/non-USDC renewals are counted separately. Deposits to/from game wallet are tracked separately and excluded from athlete trade PnL. FUN token transfers are tracked in activity and summary metrics but excluded from athlete cost basis/PnL. positionsByToken is computed from the full scanned activity set (bounded by scan limits such as maxPages/deadline). currentValueAllHoldingsUsdcRaw sums priced holdings; missing historical trades may still skew cost basis. unrealizedPnlExcludingFreeUsdcRaw excludes free shares currently held (pro-rata reduction on sells). realizedPnlEconomicUsdcRaw uses trade proceeds even if redirected to another recipient (cashflow remains in realizedPnlUsdcRaw).",
    },
    debug: {
      contracts: [...contractSet].map((c) => ({ address: c, label: shortenAddress(c) })),
      contractMapping: SPORTFUN_ERC1155_CONTRACTS.map((pt) => ({
        playerToken: pt,
        fdfPair: getFdfPairForPlayerToken(pt),
        developmentPlayers: SPORTFUN_DEV_PLAYERS_CONTRACTS.find((d) => getPlayerTokenForDevPlayers(d) === pt),
      })),
      shareDeltaMismatchSamples,
    },
  };

  return payload;
  }

  const mode = q.mode ?? (scanMode === "full" ? "async" : "sync");
  const jobIdParam = q.jobId;
  const snapshotKey = `sportfun:portfolio:snapshot:v${PORTFOLIO_CACHE_SCHEMA_VERSION}:${walletLc}`;
  const jobIndexKey = `sportfun:portfolio:job-index:v${PORTFOLIO_CACHE_SCHEMA_VERSION}:${walletLc}:${cacheKey}`;
  const jobTtl = 60 * 30;
  const snapshotTtl = 60 * 60;
  const kvPayloadMaxBytes = 900_000;

  type PortfolioJobStatus = "pending" | "running" | "completed" | "failed";
  type PortfolioJob = {
    id: string;
    status: PortfolioJobStatus;
    createdAt: string;
    startedAt?: string;
    finishedAt?: string;
    error?: string;
    cacheKey: string;
    snapshotKey: string;
    cacheStored?: boolean;
  };

  const latestSnapshot = kvEnabled() ? await kvGetJson<unknown>(snapshotKey) : null;

  const jobKey = (id: string) => `sportfun:portfolio:job:${id}`;
  const readJob = async (jobId: string) => {
    if (!kvEnabled()) return null;
    return kvGetJson<PortfolioJob>(jobKey(jobId));
  };
  const writeJob = async (job: PortfolioJob) => {
    if (!kvEnabled()) return false;
    return kvSetJson(jobKey(job.id), job, jobTtl);
  };

  const persistPayloadToKv = async (
    payload: unknown,
    keys: { cacheKey: string; snapshotKey: string }
  ): Promise<boolean> => {
    if (!kvEnabled()) return false;
    try {
      const raw = JSON.stringify(payload);
      if (raw.length >= kvPayloadMaxBytes) return false;
      await kvSetRaw(keys.cacheKey, raw, cacheTtl);
      await kvSetRaw(keys.snapshotKey, raw, snapshotTtl);
      return true;
    } catch {
      // ignore cache failures
      return false;
    }
  };

  const resolveCompletedJobPayload = async (
    job: PortfolioJob
  ): Promise<Record<string, unknown> | null> => {
    const cached = await kvGetJson<Record<string, unknown>>(job.cacheKey);
    if (cached) return cached;

    try {
      const payload = (await buildPayload()) as Record<string, unknown>;
      await persistPayloadToKv(payload, {
        cacheKey: job.cacheKey,
        snapshotKey: job.snapshotKey,
      });
      return payload;
    } catch {
      return null;
    }
  };

  const respondWithStatus = (job: PortfolioJob | null, jobId?: string) => {
    return NextResponse.json({
      status: job?.status ?? "pending",
      jobId: jobId ?? job?.id,
      error: job?.error,
      snapshot: latestSnapshot ?? undefined,
    });
  };

  if (mode === "async" || jobIdParam) {
    if (!kvEnabled()) {
      const payload = await buildPayload();
      return NextResponse.json(payload);
    }

    if (jobIdParam) {
      const job = await readJob(jobIdParam);
      if (!job) {
        return respondWithStatus(null, jobIdParam);
      }
      if (job.status === "completed") {
        const payload = await resolveCompletedJobPayload(job);
        if (payload) {
          return NextResponse.json({ ...payload, status: "completed", jobId: job.id });
        }
        return respondWithStatus(
          {
            ...job,
            status: "failed",
            error: "Completed job result is unavailable. Please rerun full scan.",
          },
          job.id
        );
      }
      return respondWithStatus(job, job.id);
    }

    const cached = await kvGetJson<Record<string, unknown>>(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, status: "completed" });
    }

    const existingJobMeta = await kvGetJson<{ jobId: string }>(jobIndexKey);
    if (existingJobMeta?.jobId) {
      const existingJob = await readJob(existingJobMeta.jobId);
      if (existingJob) {
        if (existingJob.status === "completed") {
          const payload = await resolveCompletedJobPayload(existingJob);
          if (payload) {
            return NextResponse.json({ ...payload, status: "completed", jobId: existingJob.id });
          }
          return respondWithStatus(
            {
              ...existingJob,
              status: "failed",
              error: "Completed job result is unavailable. Please rerun full scan.",
            },
            existingJob.id
          );
        }
        return respondWithStatus(existingJob, existingJob.id);
      }
    }

    const jobId = crypto.randomUUID();
    const job: PortfolioJob = {
      id: jobId,
      status: "pending",
      createdAt: new Date().toISOString(),
      cacheKey,
      snapshotKey,
    };
    await kvSetJson(jobIndexKey, { jobId }, jobTtl);
    await writeJob(job);

    const runJob = async () => {
      await writeJob({ ...job, status: "running", startedAt: new Date().toISOString() });
      try {
        const payload = await buildPayload();
        const cacheStored = await persistPayloadToKv(payload, { cacheKey, snapshotKey });
        await writeJob({
          ...job,
          status: "completed",
          finishedAt: new Date().toISOString(),
          cacheStored,
        });
      } catch (err: unknown) {
        await writeJob({
          ...job,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
          finishedAt: new Date().toISOString(),
        });
      }
    };

    void runJob();
    return respondWithStatus(job, jobId);
  }

  if (kvEnabled()) {
    const cached = await kvGetJson<unknown>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  const payload = await buildPayload();

  await persistPayloadToKv(payload, { cacheKey, snapshotKey });

  return NextResponse.json(payload);
}
