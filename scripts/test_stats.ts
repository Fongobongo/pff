import assert from "node:assert/strict";
import { scoreFootball } from "@/lib/stats/football";
import { scoreNfl } from "@/lib/stats/nfl";

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

console.log("stats tests passed");
