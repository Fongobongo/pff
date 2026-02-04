import assert from "node:assert/strict";
import { scoreFootball } from "@/lib/stats/football";
import { scoreNfl } from "@/lib/stats/nfl";
import { STATSBOMB_MAPPED_FIELDS } from "@/lib/stats/statsbomb";
import { NFLVERSE_DERIVED_FIELDS, NFLVERSE_MAPPED_FIELDS } from "@/lib/stats/nflverse";
import { FOOTBALL_STAT_KEYS, NFL_STAT_KEYS } from "@/lib/stats/types";

function nearlyEqual(actual: number, expected: number, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) < epsilon, `Expected ${expected}, got ${actual}`);
}

const nflScore = scoreNfl({
  passing_yards: 300,
  passing_td: 1,
  passing_interception: 1,
});

nearlyEqual(nflScore.totalRounded, 18);

const nflReceiving = scoreNfl({
  receiving_yards: 100,
  receiving_td: 1,
});

nearlyEqual(nflReceiving.totalRounded, 19);

const footballScore = scoreFootball(
  {
    goals: 1,
    shots_off_target: 2,
  },
  {
    position: "MID",
    competitionTier: "A",
    result: "win",
    minutesPlayed: 30,
  }
);

nearlyEqual(footballScore.totalRounded, 50 - 2 + 15);

const footballCleanSheet = scoreFootball(
  {
    clean_sheet_45_plus: 1,
    goals_conceded: 2,
  },
  {
    position: "GK",
  }
);

nearlyEqual(footballCleanSheet.totalRounded, 40 - 10);

const footballPenaltyAssist = scoreFootball(
  {
    assists_penalties_won: 1,
  },
  {
    position: "MID",
  }
);

nearlyEqual(footballPenaltyAssist.totalRounded, 30);

function assertSameKeys(left: readonly string[], right: readonly string[], label: string) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const missing = [...leftSet].filter((key) => !rightSet.has(key));
  const extra = [...rightSet].filter((key) => !leftSet.has(key));

  assert.ok(
    missing.length === 0 && extra.length === 0,
    `${label} mismatch. Missing: ${missing.join(", ") || "none"}. Extra: ${extra.join(", ") || "none"}.`
  );
}

const nflCoverage = new Set<string>([...NFLVERSE_MAPPED_FIELDS, ...NFLVERSE_DERIVED_FIELDS]);
const nflMissing = NFL_STAT_KEYS.filter((key) => !nflCoverage.has(key));
assert.ok(nflMissing.length === 0, `NFL stat keys missing from provider coverage: ${nflMissing.join(", ")}`);

assertSameKeys(FOOTBALL_STAT_KEYS, STATSBOMB_MAPPED_FIELDS, "StatsBomb coverage vs football stat keys");

console.log("stats tests passed");
