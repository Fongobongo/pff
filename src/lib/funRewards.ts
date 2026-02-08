export type FunRewardTier = {
  minBalance: number;
  holdingScore: number;
  weeklyBonusTp: number;
  seasonFunMultiplier: number;
};

export type FunRewardEstimate = {
  balance: number;
  tier: FunRewardTier;
  nextTier?: FunRewardTier;
  deltaToNext?: number;
};

export const DEFAULT_FUN_REWARD_TIERS: FunRewardTier[] = [
  { minBalance: 0, holdingScore: 0, weeklyBonusTp: 0, seasonFunMultiplier: 1 },
  { minBalance: 1000, holdingScore: 10, weeklyBonusTp: 5, seasonFunMultiplier: 1.05 },
  { minBalance: 5000, holdingScore: 25, weeklyBonusTp: 12, seasonFunMultiplier: 1.12 },
  { minBalance: 20000, holdingScore: 60, weeklyBonusTp: 30, seasonFunMultiplier: 1.25 },
  { minBalance: 50000, holdingScore: 120, weeklyBonusTp: 70, seasonFunMultiplier: 1.4 },
  { minBalance: 100000, holdingScore: 250, weeklyBonusTp: 150, seasonFunMultiplier: 1.65 },
];

function normalizeTier(tier: FunRewardTier): FunRewardTier | null {
  const minBalance = Number(tier.minBalance);
  const holdingScore = Number(tier.holdingScore);
  const weeklyBonusTp = Number(tier.weeklyBonusTp);
  const seasonFunMultiplier = Number(tier.seasonFunMultiplier);

  if (!Number.isFinite(minBalance) || minBalance < 0) return null;
  if (!Number.isFinite(holdingScore) || holdingScore < 0) return null;
  if (!Number.isFinite(weeklyBonusTp) || weeklyBonusTp < 0) return null;
  if (!Number.isFinite(seasonFunMultiplier) || seasonFunMultiplier <= 0) return null;

  return {
    minBalance,
    holdingScore,
    weeklyBonusTp,
    seasonFunMultiplier,
  };
}

export function sanitizeFunRewardTiers(tiers: FunRewardTier[]): FunRewardTier[] {
  const unique = new Map<number, FunRewardTier>();

  for (const tier of tiers) {
    const normalized = normalizeTier(tier);
    if (!normalized) continue;
    unique.set(normalized.minBalance, normalized);
  }

  return Array.from(unique.values()).sort((a, b) => a.minBalance - b.minBalance);
}

export function parseFunRewardTiersJson(raw?: string): FunRewardTier[] | null {
  if (!raw?.trim()) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const tiers = sanitizeFunRewardTiers(parsed as FunRewardTier[]);
    return tiers.length ? tiers : null;
  } catch {
    return null;
  }
}

export function getFunRewardTiers(overrideJson?: string): FunRewardTier[] {
  const override = parseFunRewardTiersJson(overrideJson);
  if (override?.length) return override;
  return DEFAULT_FUN_REWARD_TIERS;
}

export function estimateFunRewards(balance: number, tiers: FunRewardTier[]): FunRewardEstimate {
  const normalizedBalance = Number.isFinite(balance) && balance > 0 ? balance : 0;
  const safeTiers = sanitizeFunRewardTiers(tiers);
  const sorted = safeTiers.length ? safeTiers : DEFAULT_FUN_REWARD_TIERS;

  let currentTier = sorted[0];
  let nextTier: FunRewardTier | undefined;

  for (const tier of sorted) {
    if (tier.minBalance <= normalizedBalance) {
      currentTier = tier;
      continue;
    }
    nextTier = tier;
    break;
  }

  const deltaToNext = nextTier ? Math.max(0, nextTier.minBalance - normalizedBalance) : undefined;

  return {
    balance: normalizedBalance,
    tier: currentTier,
    nextTier,
    deltaToNext,
  };
}
