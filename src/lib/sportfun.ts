import type { Abi } from "viem";

// Known Sport.fun (pro.football.fun) on-chain contracts on Base.
// We keep this explicit to avoid mixing in unrelated ERC-1155 activity.
export const SPORTFUN_PLAYER_TOKENS = [
  {
    // Player token (ERC-1155 proxy)
    playerToken: "0x71c8b0c5148edb0399d1edf9bf0c8c81dea16918",
    // AMM / exchange (FDFPair proxy)
    fdfPair: "0x9da1bb4e725acc0d96010b7ce2a7244cda446617",
    // Promotions contract (proxy)
    developmentPlayers: "0xc21c2d586f1db92eedb67a2fc348f21ed7541965",
    label: "sportfun-1",
  },
  {
    playerToken: "0x2eef466e802ab2835ab81be63eebc55167d35b56",
    fdfPair: "0x4fdce033b9f30019337ddc5cc028dc023580585e",
    developmentPlayers: "0xc98bf3fc49a8a7ad162098ad0bb62268d46dacf9",
    label: "sportfun-2",
  },
] as const;

export const SPORTFUN_ERC1155_CONTRACTS = SPORTFUN_PLAYER_TOKENS.map((x) => x.playerToken) as readonly string[];
export const SPORTFUN_FDF_PAIR_CONTRACTS = SPORTFUN_PLAYER_TOKENS.map((x) => x.fdfPair) as readonly string[];
export const SPORTFUN_DEV_PLAYERS_CONTRACTS = SPORTFUN_PLAYER_TOKENS.map((x) => x.developmentPlayers) as readonly string[];

export const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
export const BASE_USDC_DECIMALS = 6;
export const SPORTFUN_ATHLETE_METADATA_BASE = "https://api.sport.fun/athletes";

export const SPORTFUN_TOPICS = {
  PlayerBatchTransfer:
    "0xb9d061782f0a4256a6d43a73bc77d6489af234b94515a1cdacaddc9b8b2196aa",
  PlayerSharesPromoted:
    "0xdf85ea724d07d95f8a2eee7dd82e4878a451bd282e57e84f96996918b441a6c2",
  PlayerTokensPurchase:
    "0x687289c2856f43779157318472d0a835253d93a290e03ee79b9e27b0e403493d",
  CurrencyPurchase:
    "0x2ac32fc1571b5f084cc08aa7b74d280dd7ccf29a3c58d1b42c369291f06a9a46",
} as const;

export function toLower(s: string | undefined): string {
  return (s ?? "").toLowerCase();
}

export function isOneOf(addr: string, list: readonly string[]): boolean {
  return list.includes(addr.toLowerCase());
}

export function getFdfPairForPlayerToken(playerToken: string): string | undefined {
  const x = SPORTFUN_PLAYER_TOKENS.find((p) => p.playerToken === playerToken.toLowerCase());
  return x?.fdfPair;
}

export function getPlayerTokenForFdfPair(fdfPair: string): string | undefined {
  const x = SPORTFUN_PLAYER_TOKENS.find((p) => p.fdfPair === fdfPair.toLowerCase());
  return x?.playerToken;
}

export function getPlayerTokenForDevPlayers(developmentPlayers: string): string | undefined {
  const x = SPORTFUN_PLAYER_TOKENS.find((p) => p.developmentPlayers === developmentPlayers.toLowerCase());
  return x?.playerToken;
}

// FDFPairV2 trade events (verified on BaseScan).
// NOTE: Topics observed show 2 indexed addresses (topics length = 3).
export const FDFPAIR_EVENTS_ABI = [
  {
    type: "event",
    name: "PlayerTokensPurchase",
    inputs: [
      { name: "buyer", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "playerTokenIds", type: "uint256[]", indexed: false },
      { name: "playerTokenAmountsToBuy", type: "uint256[]", indexed: false },
      { name: "currencySpent", type: "uint256[]", indexed: false },
      { name: "newPrices", type: "uint256[]", indexed: false },
      { name: "feeAmounts", type: "uint256[]", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "CurrencyPurchase",
    inputs: [
      { name: "seller", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "playerTokenIds", type: "uint256[]", indexed: false },
      { name: "playerTokenAmountsSold", type: "uint256[]", indexed: false },
      { name: "currencyReceived", type: "uint256[]", indexed: false },
      { name: "newPrices", type: "uint256[]", indexed: false },
      { name: "feeAmounts", type: "uint256[]", indexed: false },
    ],
    anonymous: false,
  },
] as const satisfies Abi;

// DevelopmentPlayers (promotion) events observed.
export const DEVPLAYERS_EVENTS_ABI = [
  {
    type: "event",
    name: "PlayerSharesPromoted",
    inputs: [
      { name: "account", type: "address", indexed: true },
      { name: "playerTokenIds", type: "uint256[]", indexed: false },
      { name: "playerTokenAmounts", type: "uint256[]", indexed: false },
    ],
    anonymous: false,
  },
] as const satisfies Abi;

export const FDFPAIR_READ_ABI = [
  {
    type: "function",
    name: "getPrices",
    stateMutability: "view",
    inputs: [{ name: "playerTokenIds", type: "uint256[]" }],
    outputs: [{ name: "amountsToReceive", type: "uint256[]" }],
  },
] as const satisfies Abi;
