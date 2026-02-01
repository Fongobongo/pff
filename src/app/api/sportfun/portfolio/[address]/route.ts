import { NextResponse } from "next/server";
import { z } from "zod";
import { alchemyRpc } from "@/lib/alchemy";
import { shortenAddress } from "@/lib/format";
import {
  decodeAbiParameters,
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  type Hex,
} from "viem";
import {
  BASE_USDC,
  BASE_USDC_DECIMALS,
  DEVPLAYERS_EVENTS_ABI,
  FDFPAIR_EVENTS_ABI,
  FDFPAIR_READ_ABI,
  SPORTFUN_DEV_PLAYERS_CONTRACTS,
  SPORTFUN_ERC1155_CONTRACTS,
  SPORTFUN_FDF_PAIR_CONTRACTS,
  SPORTFUN_TOPICS,
  getFdfPairForPlayerToken,
  getPlayerTokenForDevPlayers,
  getPlayerTokenForFdfPair,
  isOneOf,
  toLower,
} from "@/lib/sportfun";

const paramsSchema = z.object({
  address: z.string().min(1),
});

const querySchema = z.object({
  maxCount: z.string().optional(),
  maxPages: z.string().optional(),
  maxActivity: z.string().optional(),
  includeTrades: z.string().optional(),
  includePrices: z.string().optional(),
  includeReceipts: z.string().optional(),
  includeUri: z.string().optional(),
});

type AlchemyTransfer = {
  category?: string;
  uniqueId?: string;
  hash?: string;
  from?: string;
  to?: string;
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
};

type TxReceipt = {
  transactionHash: Hex;
  blockNumber?: Hex;
  logs?: TxReceiptLog[];
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

async function fetchTransfersForWallet(params: {
  address: string;
  direction: "incoming" | "outgoing";
  category: "erc1155" | "erc20";
  contractAddresses?: string[];
  maxCount: string;
  maxPages: number;
}): Promise<AlchemyTransfer[]> {
  const baseParams: {
    fromBlock: string;
    toBlock: "latest";
    category: ["erc1155"] | ["erc20"];
    withMetadata: true;
    maxCount: string;
    order: "desc";
    contractAddresses?: string[];
  } = {
    fromBlock: "0x0",
    toBlock: "latest",
    category: [params.category],
    withMetadata: true,
    maxCount: params.maxCount,
    order: "desc",
    ...(params.contractAddresses ? { contractAddresses: params.contractAddresses } : {}),
  };

  let pageKey: string | undefined;
  const all: AlchemyTransfer[] = [];

  for (let page = 0; page < params.maxPages; page++) {
    const result = (await withRetry(
      () =>
        alchemyRpc("alchemy_getAssetTransfers", [
          {
            ...baseParams,
            ...(params.direction === "incoming"
              ? { toAddress: params.address }
              : { fromAddress: params.address }),
            ...(pageKey ? { pageKey } : {}),
          },
        ]),
      { retries: 3 }
    )) as { transfers?: AlchemyTransfer[]; pageKey?: string };

    const transfers = result.transfers ?? [];
    all.push(...transfers);

    pageKey = result.pageKey;
    if (!pageKey) break;
  }

  return all;
}

function dedupeTransfers(transfers: AlchemyTransfer[]): AlchemyTransfer[] {
  const byId = new Map<string, AlchemyTransfer>();
  for (const t of transfers) {
    const id = t.uniqueId ?? `${t.hash ?? ""}:${t.from ?? ""}:${t.to ?? ""}:${t.category ?? ""}`;
    if (!byId.has(id)) byId.set(id, t);
  }
  return [...byId.values()];
}

async function fetchReceipt(txHash: string): Promise<TxReceipt | null> {
  try {
    const receipt = (await withRetry(
      () => alchemyRpc("eth_getTransactionReceipt", [txHash]),
      { retries: 3, baseDelayMs: 250 }
    )) as TxReceipt | null;
    return receipt;
  } catch {
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

type ActivityItem = {
  hash: string;
  timestamp?: string;
  usdcDeltaRaw: string;
  erc1155Changes: Erc1155Change[];
  inferred?: InferredTrade;
};

type ActivityEnrichedItem = ActivityItem & {
  kind: "buy" | "sell" | "unknown";
  decoded?: {
    trades: DecodedTradeItem[];
    promotions: DecodedPromotionItem[];
    unknownSportfunTopics: Array<{ address: string; topic0: string }>;
  };
  receipt?: TxReceipt;
};

function safeDiv(a: bigint, b: bigint): bigint | undefined {
  if (b === 0n) return undefined;
  return a / b;
}

function decodeReceiptForSportfun(params: {
  receipt: TxReceipt;
  walletLc: string;
}): {
  trades: DecodedTradeItem[];
  promotions: DecodedPromotionItem[];
  unknownSportfunTopics: Array<{ address: string; topic0: string }>;
} {
  const trades: DecodedTradeItem[] = [];
  const promotions: DecodedPromotionItem[] = [];
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
  }

  return { trades, promotions, unknownSportfunTopics };
}

function tokenKey(playerToken: string, tokenIdDec: string): string {
  return `${playerToken.toLowerCase()}:${tokenIdDec}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function GET(request: Request, context: { params: Promise<{ address: string }> }) {
  const { address } = paramsSchema.parse(await context.params);
  const url = new URL(request.url);
  const q = querySchema.parse(Object.fromEntries(url.searchParams.entries()));

  const wallet = address;
  const walletLc = wallet.toLowerCase();

  const maxCount = q.maxCount ?? "0x3e8"; // 1000 per page
  const maxPages = Math.max(1, Math.min(10, q.maxPages ? Number(q.maxPages) : 3));

  const maxActivity = Math.max(1, Math.min(500, q.maxActivity ? Number(q.maxActivity) : 100));
  const includeTrades = parseBool(q.includeTrades, true);
  const includePrices = parseBool(q.includePrices, true);
  const includeReceipts = parseBool(q.includeReceipts, false);
  const includeUri = parseBool(q.includeUri, false);

  const [erc1155Incoming, erc1155Outgoing] = await Promise.all([
    fetchTransfersForWallet({
      address: wallet,
      direction: "incoming",
      category: "erc1155",
      maxCount,
      maxPages,
    }),
    fetchTransfersForWallet({
      address: wallet,
      direction: "outgoing",
      category: "erc1155",
      maxCount,
      maxPages,
    }),
  ]);

  const erc1155Transfers = dedupeTransfers([...erc1155Incoming, ...erc1155Outgoing]);

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

  // Fetch USDC transfers and compute per-tx delta by hash.
  const [usdcIncoming, usdcOutgoing] = await Promise.all([
    fetchTransfersForWallet({
      address: wallet,
      direction: "incoming",
      category: "erc20",
      contractAddresses: [BASE_USDC],
      maxCount,
      maxPages,
    }),
    fetchTransfersForWallet({
      address: wallet,
      direction: "outgoing",
      category: "erc20",
      contractAddresses: [BASE_USDC],
      maxCount,
      maxPages,
    }),
  ]);

  const usdcTransfers = dedupeTransfers([...usdcIncoming, ...usdcOutgoing]);
  const usdcDeltaByHash = new Map<string, bigint>();

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
  }

  const activityAll = [...erc1155DeltaByHash.entries()]
    .map(([hash, deltas]) => {
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
        erc1155Changes,
        inferred,
      };
    })
    .sort((a, b) => String(b.timestamp ?? "").localeCompare(String(a.timestamp ?? "")));

  const activity = activityAll.slice(0, maxActivity);
  const activityTruncated = activityAll.length > activity.length;

  // Fetch and decode receipts (authoritative trade semantics).
  const receiptByHash = new Map<string, TxReceipt>();
  const decodedByHash = new Map<
    string,
    {
      trades: DecodedTradeItem[];
      promotions: DecodedPromotionItem[];
      unknownSportfunTopics: Array<{ address: string; topic0: string }>;
    }
  >();

  if (includeTrades || includeReceipts) {
    const hashes = activity.map((a) => a.hash);

    const receipts = await mapLimit(hashes, 4, async (h) => {
      const r = await fetchReceipt(h);
      return { h, r };
    });

    for (const { h, r } of receipts) {
      if (!r) continue;
      receiptByHash.set(h, r);

      const decoded = decodeReceiptForSportfun({ receipt: r, walletLc });
      decodedByHash.set(h, decoded);
    }
  }

  // Prices / valuation via FDFPair.getPrices(tokenIds).
  const priceByHoldingKey = new Map<string, { priceUsdcPerShareRaw: bigint; valueUsdcRaw: bigint }>();

  if (includePrices && holdings.length > 0) {
    const holdingsByContract = new Map<string, Array<{ tokenIdDec: string; balanceRaw: bigint }>>();

    for (const h of holdings) {
      const list = holdingsByContract.get(h.contractAddress) ?? [];
      list.push({ tokenIdDec: h.tokenIdDec, balanceRaw: BigInt(h.balanceRaw) });
      holdingsByContract.set(h.contractAddress, list);
    }

    for (const [playerToken, list] of holdingsByContract.entries()) {
      const fdfPair = getFdfPairForPlayerToken(playerToken);
      if (!fdfPair) continue;

      const tokenIds = list.map((x) => BigInt(x.tokenIdDec));
      const batches = chunk(tokenIds, 100);

      let offset = 0;
      for (const batch of batches) {
        const data = encodeFunctionData({
          abi: FDFPAIR_READ_ABI,
          functionName: "getPrices",
          args: [batch],
        });

        try {
          const result = (await withRetry(
            () => alchemyRpc("eth_call", [{ to: fdfPair, data }, "latest"]),
            { retries: 3, baseDelayMs: 250 }
          )) as Hex;

          const decoded = decodeFunctionResult({
            abi: FDFPAIR_READ_ABI,
            functionName: "getPrices",
            data: result,
          });

          const amountsToReceive = decoded as readonly bigint[];

          for (let i = 0; i < batch.length; i++) {
            const tokenIdDec = batch[i].toString(10);
            const price = amountsToReceive[i] ?? 0n;
            const holding = list[offset + i];
            const balance = holding?.balanceRaw ?? 0n;
            const value = (price * balance) / 10n ** 18n;
            priceByHoldingKey.set(tokenKey(playerToken, tokenIdDec), {
              priceUsdcPerShareRaw: price,
              valueUsdcRaw: value,
            });
          }
        } catch {
          // Ignore pricing failures for now.
        }

        offset += batch.length;
      }
    }
  }

  // Optional ERC-1155 `uri(tokenId)` lookups.
  const uriByKey = new Map<string, { uri?: string; error?: string }>();

  if (includeUri) {
    await mapLimit(holdings, 8, async (h) => {
      const key = `${h.contractAddress}:${h.tokenIdHex}`;
      try {
        const data = encodeErc1155UriCall(BigInt(h.tokenIdHex));
        const result = (await withRetry(
          () => alchemyRpc("eth_call", [{ to: h.contractAddress, data }, "latest"]),
          { retries: 2, baseDelayMs: 200 }
        )) as Hex;
        const uri = decodeAbiString(result);
        uriByKey.set(key, { uri });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        uriByKey.set(key, { error: msg });
      }
    });
  }

  const holdingsEnriched = holdings.map((h) => {
    const meta = uriByKey.get(`${h.contractAddress}:${h.tokenIdHex}`);
    const priceMeta = priceByHoldingKey.get(tokenKey(h.contractAddress, h.tokenIdDec));
    return {
      ...h,
      uri: meta?.uri,
      uriError: meta?.error,
      priceUsdcPerShareRaw: priceMeta?.priceUsdcPerShareRaw?.toString(10),
      valueUsdcRaw: priceMeta?.valueUsdcRaw?.toString(10),
    };
  });

  // Attach decoded trades/promotions to activity (optional).
  const activityEnriched: ActivityEnrichedItem[] = activity.map((a) => {
    const decoded = decodedByHash.get(a.hash);

    // If we have decoded trades, we treat them as the primary classification.
    const primaryKind = decoded?.trades?.length
      ? decoded.trades.every((t) => t.kind === "buy")
        ? "buy"
        : decoded.trades.every((t) => t.kind === "sell")
          ? "sell"
          : "unknown"
      : a.inferred?.kind ?? "unknown";

    return {
      ...a,
      kind: primaryKind,
      decoded: decoded
        ? {
            trades: decoded.trades,
            promotions: decoded.promotions,
            unknownSportfunTopics: decoded.unknownSportfunTopics,
          }
        : undefined,
      receipt: includeReceipts ? receiptByHash.get(a.hash) : undefined,
    };
  });

  // Portfolio analytics (moving average cost basis, per tokenId).
  // NOTE: This is wallet-centric and uses decoded trade flows when available.
  type LedgerItem =
    | ({ itemKind: "trade" } & DecodedTradeItem & { txHash: string; timestamp?: string })
    | ({ itemKind: "promotion" } & DecodedPromotionItem & { txHash: string; timestamp?: string });

  const ledger: LedgerItem[] = [];
  let decodedTradeCount = 0;
  let decodedPromotionCount = 0;

  for (const a of activityEnriched) {
    const decoded = a.decoded;
    if (!decoded) continue;

    decodedTradeCount += decoded.trades?.length ?? 0;
    decodedPromotionCount += decoded.promotions?.length ?? 0;

    for (const t of decoded.trades ?? []) {
      ledger.push({ itemKind: "trade", ...t, txHash: a.hash, timestamp: a.timestamp });
    }

    for (const p of decoded.promotions ?? []) {
      ledger.push({ itemKind: "promotion", ...p, txHash: a.hash, timestamp: a.timestamp });
    }
  }

  ledger.sort((a, b) => String(a.timestamp ?? "").localeCompare(String(b.timestamp ?? "")));

  const positionByKey = new Map<string, { shares: bigint; costUsdc: bigint }>();
  let realizedPnlUsdcRaw = 0n;
  let costBasisUnknownTradeCount = 0;

  for (const item of ledger) {
    const playerToken = item.playerToken;
    if (!playerToken) continue;

    const shareDelta = BigInt(item.walletShareDeltaRaw);
    if (shareDelta === 0n) continue;

    const key = tokenKey(playerToken, item.tokenIdDec);
    const pos = positionByKey.get(key) ?? { shares: 0n, costUsdc: 0n };

    if (item.itemKind === "promotion") {
      // Promotions are treated as free shares (cost = 0). This adjusts average cost per
      // share and improves unrealized PnL accuracy when promotions occurred.
      if (shareDelta > 0n) {
        pos.shares += shareDelta;
      } else {
        // Defensive: handle negative deltas (should be rare/unexpected for promotions).
        const removed = -shareDelta;
        if (pos.shares > 0n) {
          const avgCostPerShare = (pos.costUsdc * 10n ** 18n) / pos.shares;
          const costBasisRemoved = (avgCostPerShare * removed) / 10n ** 18n;
          pos.shares -= removed;
          pos.costUsdc -= costBasisRemoved;
        }
      }

      positionByKey.set(key, pos);
      continue;
    }

    const currencyDelta = BigInt(item.walletCurrencyDeltaRaw);

    if (shareDelta > 0n) {
      // Buy.
      pos.shares += shareDelta;
      if (currencyDelta < 0n) {
        pos.costUsdc += -currencyDelta;
      } else {
        costBasisUnknownTradeCount++;
      }
    } else {
      // Sell.
      const sold = -shareDelta;

      if (pos.shares > 0n) {
        const avgCostPerShare = (pos.costUsdc * 10n ** 18n) / pos.shares;
        const costBasisSold = (avgCostPerShare * sold) / 10n ** 18n;

        pos.shares -= sold;
        pos.costUsdc -= costBasisSold;

        if (currencyDelta > 0n) {
          realizedPnlUsdcRaw += currencyDelta - costBasisSold;
        }
      }
    }

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

  // Tracked positions: cost basis and unrealized PnL are only computed for tokenIds
  // that appear in decoded trades/promotions.
  let currentValueUsdcRaw = 0n;
  let unrealizedPnlUsdcRaw = 0n;
  let totalCostBasisUsdcRaw = 0n;

  for (const [key, pos] of positionByKey.entries()) {
    totalCostBasisUsdcRaw += pos.costUsdc;

    const priceMeta = priceByHoldingKey.get(key);
    if (!priceMeta) continue;

    const value = priceMeta.valueUsdcRaw;
    currentValueUsdcRaw += value;
    unrealizedPnlUsdcRaw += value - pos.costUsdc;
  }

  return NextResponse.json({
    chain: "base",
    protocol: "sportfun",
    address: wallet,
    query: {
      maxPages,
      maxCount,
      maxActivity,
      includeTrades,
      includePrices,
      includeReceipts,
      includeUri,
    },
    assumptions: {
      shareUnits: "Player share amounts are treated as 18-dec fixed-point (1e18 = 1 share).",
      knownContracts: SPORTFUN_ERC1155_CONTRACTS,
      fdfPairs: SPORTFUN_FDF_PAIR_CONTRACTS,
      usdc: {
        contractAddress: BASE_USDC,
        decimals: BASE_USDC_DECIMALS,
        note: "USDC correlation by tx hash is retained for debugging, but authoritative trades come from FDFPairV2 events.",
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
      decodedTradeCount,
      decodedPromotionCount,
    },
    holdings: holdingsEnriched,
    activity: activityEnriched,
    analytics: {
      realizedPnlUsdcRaw: realizedPnlUsdcRaw.toString(10),
      unrealizedPnlUsdcRaw: unrealizedPnlUsdcRaw.toString(10),
      totalCostBasisUsdcRaw: totalCostBasisUsdcRaw.toString(10),
      // Value of positions that have a computed cost basis (decoded trades/promotions).
      currentValueUsdcRaw: currentValueUsdcRaw.toString(10),
      // Value of all priced holdings (independent of cost basis tracking).
      currentValueAllHoldingsUsdcRaw: currentValueAllHoldingsUsdcRaw.toString(10),
      holdingsPricedCount,
      costBasisUnknownTradeCount,
      note: "PnL is a WIP: cost basis is tracked only from decoded FDFPair trades (moving average). Promotions add free shares (zero cost). currentValueAllHoldingsUsdcRaw sums priced holdings; missing historical trades may still skew cost basis.",
    },
    debug: {
      contracts: [...contractSet].map((c) => ({ address: c, label: shortenAddress(c) })),
      contractMapping: SPORTFUN_ERC1155_CONTRACTS.map((pt) => ({
        playerToken: pt,
        fdfPair: getFdfPairForPlayerToken(pt),
        developmentPlayers: SPORTFUN_DEV_PLAYERS_CONTRACTS.find((d) => getPlayerTokenForDevPlayers(d) === pt),
      })),
    },
  });
}
