import { withCache } from "@/lib/stats/cache";
import { alchemyRpc } from "@/lib/alchemy";
import { BASE_USDC, BASE_USDC_DECIMALS } from "@/lib/sportfun";
import {
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  type Abi,
  type Hex,
} from "viem";

export const FUN_TOKEN_ADDRESS = "0x16EE7ecAc70d1028E7712751E2Ee6BA808a7dd92";
export const FUN_PAIR_ADDRESS = "0x659bE70647B0f63217D60e077F4417b1eCC65064";

const ERC20_ABI: Abi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const PAIR_ABI: Abi = [
  {
    type: "function",
    name: "token0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "token1",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "reserve0", type: "uint112" },
      { name: "reserve1", type: "uint112" },
      { name: "blockTimestampLast", type: "uint32" },
    ],
  },
];

const SWAP_EVENT_ABI: Abi = [
  {
    type: "event",
    name: "Swap",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "amount0In", type: "uint256", indexed: false },
      { name: "amount1In", type: "uint256", indexed: false },
      { name: "amount0Out", type: "uint256", indexed: false },
      { name: "amount1Out", type: "uint256", indexed: false },
      { name: "to", type: "address", indexed: true },
    ],
    anonymous: false,
  },
];

const SYNC_EVENT_ABI: Abi = [
  {
    type: "event",
    name: "Sync",
    inputs: [
      { name: "reserve0", type: "uint112", indexed: false },
      { name: "reserve1", type: "uint112", indexed: false },
    ],
    anonymous: false,
  },
];

const SWAP_TOPIC = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";
const SYNC_TOPIC = "0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1";
const LOG_CHUNK_BLOCKS = 2500n;

type RpcLog = {
  address: string;
  data: Hex;
  topics: Hex[];
  blockNumber: Hex;
};

type FunTokenSnapshot = {
  asOf: string;
  token: string;
  pair: string;
  priceUsdcRaw?: string;
  priceChange24hPercent?: number;
  volume24hUsdcRaw?: string;
  liquidityUsdcRaw?: string;
  marketCapUsdcRaw?: string;
  fdvUsdcRaw?: string;
};

function toHex(value: bigint): Hex {
  return `0x${value.toString(16)}` as Hex;
}

async function ethCall(to: string, abi: Abi, functionName: string, args: unknown[] = []) {
  const data = encodeFunctionData({ abi, functionName, args });
  const result = await alchemyRpc("eth_call", [{ to, data }, "latest"]);
  return decodeFunctionResult({ abi, functionName, data: result });
}

async function getLatestBlock(): Promise<bigint> {
  const result = await alchemyRpc("eth_blockNumber", []);
  return BigInt(result);
}

async function getBlockTimestampMs(blockNumber: bigint): Promise<number> {
  const cacheKey = `fun:block-ts:${blockNumber.toString()}`;
  const cached = await withCache(cacheKey, 86400, async () => {
    const block = await alchemyRpc("eth_getBlockByNumber", [toHex(blockNumber), false]);
    const ts = Number(BigInt(block.timestamp));
    return ts * 1000;
  });
  return cached;
}

async function findBlockByTimestamp(targetMs: number): Promise<bigint> {
  const key = `fun:block-at:${Math.floor(targetMs / 1000)}`;
  const cached = await withCache(key, 3600, async () => {
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
    return high.toString(10);
  });
  return BigInt(cached);
}

async function fetchLogsChunk(params: {
  address: string;
  topic0: string;
  fromBlock: bigint;
  toBlock: bigint;
}): Promise<RpcLog[]> {
  const filter = {
    address: params.address,
    topics: [params.topic0],
    fromBlock: toHex(params.fromBlock),
    toBlock: toHex(params.toBlock),
  };
  return alchemyRpc("eth_getLogs", [filter]);
}

async function fetchLogs(params: { address: string; topic0: string; fromBlock: bigint; toBlock: bigint }) {
  const logs: RpcLog[] = [];
  let start = params.fromBlock;
  let chunk = LOG_CHUNK_BLOCKS;
  while (start <= params.toBlock) {
    let end = start + chunk - 1n;
    if (end > params.toBlock) end = params.toBlock;
    try {
      const batch = await fetchLogsChunk({ ...params, fromBlock: start, toBlock: end });
      logs.push(...batch);
      start = end + 1n;
    } catch (err) {
      if (chunk <= 200n) throw err;
      chunk = chunk / 2n;
    }
  }
  return logs;
}

function computePrice(params: { reserveFun: bigint; reserveUsdc: bigint; funDecimals: number }) {
  if (params.reserveFun === 0n) return undefined;
  const funScale = 10n ** BigInt(params.funDecimals);
  return (params.reserveUsdc * funScale) / params.reserveFun;
}

export async function getFunTokenSnapshot(): Promise<FunTokenSnapshot> {
  return withCache("fun:token:snapshot", 120, async () => {
    const now = Date.now();

    try {
      const token0 = (await ethCall(FUN_PAIR_ADDRESS, PAIR_ABI, "token0")) as string;

      const [reserve0, reserve1] = (await ethCall(FUN_PAIR_ADDRESS, PAIR_ABI, "getReserves")) as [
        bigint,
        bigint,
      ];

      const token0Lc = token0.toLowerCase();
      const funLc = FUN_TOKEN_ADDRESS.toLowerCase();
      const usdcLc = BASE_USDC.toLowerCase();

      const funIsToken0 = token0Lc === funLc;
      const usdcIsToken0 = token0Lc === usdcLc;

      const funDecimals = Number(await ethCall(FUN_TOKEN_ADDRESS, ERC20_ABI, "decimals"));
      const totalSupply = (await ethCall(FUN_TOKEN_ADDRESS, ERC20_ABI, "totalSupply")) as bigint;

      const reserveFun = funIsToken0 ? reserve0 : reserve1;
      const reserveUsdc = usdcIsToken0 ? reserve0 : reserve1;

      const priceUsdcRaw = computePrice({ reserveFun, reserveUsdc, funDecimals });

      const liquidityUsdcRaw = reserveUsdc * 2n;
      const marketCapUsdcRaw = priceUsdcRaw ? (priceUsdcRaw * totalSupply) / 10n ** BigInt(funDecimals) : undefined;

      const windowStart = now - 24 * 60 * 60 * 1000;
      const fromBlock = await findBlockByTimestamp(windowStart);
      const toBlock = await getLatestBlock();

      const [swapLogs, syncLogs] = await Promise.all([
        fetchLogs({ address: FUN_PAIR_ADDRESS, topic0: SWAP_TOPIC, fromBlock, toBlock }),
        fetchLogs({ address: FUN_PAIR_ADDRESS, topic0: SYNC_TOPIC, fromBlock, toBlock }),
      ]);

      let volumeUsdc = 0n;
      for (const log of swapLogs) {
        try {
          const decoded = decodeEventLog({
            abi: SWAP_EVENT_ABI,
            data: log.data,
            topics: log.topics as [Hex, ...Hex[]],
          });
          const args = decoded.args as
            | {
                amount0In: bigint;
                amount0Out: bigint;
                amount1In: bigint;
                amount1Out: bigint;
              }
            | undefined;
          if (!args) continue;
          const { amount0In, amount0Out, amount1In, amount1Out } = args;

          if (usdcIsToken0) {
            volumeUsdc += (amount0In ?? 0n) + (amount0Out ?? 0n);
          } else {
            volumeUsdc += (amount1In ?? 0n) + (amount1Out ?? 0n);
          }
        } catch {
          // ignore decode errors
        }
      }

      let priceStart: bigint | undefined;
      let priceEnd: bigint | undefined;
      if (syncLogs.length) {
        const first = syncLogs[0];
        const last = syncLogs[syncLogs.length - 1];
        try {
          const decodedFirst = decodeEventLog({
            abi: SYNC_EVENT_ABI,
            data: first.data,
            topics: first.topics as [Hex, ...Hex[]],
          });
          const decodedLast = decodeEventLog({
            abi: SYNC_EVENT_ABI,
            data: last.data,
            topics: last.topics as [Hex, ...Hex[]],
          });
          const firstArgs = decodedFirst.args as { reserve0: bigint; reserve1: bigint } | undefined;
          const lastArgs = decodedLast.args as { reserve0: bigint; reserve1: bigint } | undefined;
          if (firstArgs && lastArgs) {
            const r0First = firstArgs.reserve0;
            const r1First = firstArgs.reserve1;
            const r0Last = lastArgs.reserve0;
            const r1Last = lastArgs.reserve1;
            const funReserveFirst = funIsToken0 ? r0First : r1First;
            const usdcReserveFirst = usdcIsToken0 ? r0First : r1First;
            const funReserveLast = funIsToken0 ? r0Last : r1Last;
            const usdcReserveLast = usdcIsToken0 ? r0Last : r1Last;
            priceStart = computePrice({ reserveFun: funReserveFirst, reserveUsdc: usdcReserveFirst, funDecimals });
            priceEnd = computePrice({ reserveFun: funReserveLast, reserveUsdc: usdcReserveLast, funDecimals });
          }
        } catch {
          // ignore
        }
      }

      const priceChange24hPercent =
        priceStart && priceEnd
          ? (Number(priceEnd - priceStart) / Number(priceStart)) * 100
          : undefined;

      return {
        asOf: new Date(now).toISOString(),
        token: FUN_TOKEN_ADDRESS,
        pair: FUN_PAIR_ADDRESS,
        priceUsdcRaw: priceUsdcRaw?.toString(10),
        priceChange24hPercent,
        volume24hUsdcRaw: volumeUsdc.toString(10),
        liquidityUsdcRaw: liquidityUsdcRaw.toString(10),
        marketCapUsdcRaw: marketCapUsdcRaw?.toString(10),
        fdvUsdcRaw: marketCapUsdcRaw?.toString(10),
      };
    } catch {
      return {
        asOf: new Date(now).toISOString(),
        token: FUN_TOKEN_ADDRESS,
        pair: FUN_PAIR_ADDRESS,
        priceUsdcRaw: undefined,
        priceChange24hPercent: undefined,
        volume24hUsdcRaw: "0",
        liquidityUsdcRaw: "0",
        marketCapUsdcRaw: undefined,
        fdvUsdcRaw: undefined,
      };
    }
  });
}

export function formatUsdFromRaw(raw?: string, decimals = BASE_USDC_DECIMALS): string {
  if (!raw) return "—";
  const neg = raw.startsWith("-");
  const abs = BigInt(neg ? raw.slice(1) : raw);
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = abs % base;
  const fracNum = Number(fraction) / Number(base);
  const value = Number(whole) + fracNum;
  const signed = neg ? -value : value;
  const absVal = Math.abs(signed);
  if (absVal >= 1e9) return `$${(signed / 1e9).toFixed(2)}B`;
  if (absVal >= 1e6) return `$${(signed / 1e6).toFixed(2)}M`;
  if (absVal >= 1e3) return `$${(signed / 1e3).toFixed(2)}K`;
  if (absVal >= 1) return `$${signed.toFixed(2)}`;
  if (absVal >= 0.01) return `$${signed.toFixed(4)}`;
  return `$${signed.toFixed(6)}`;
}
