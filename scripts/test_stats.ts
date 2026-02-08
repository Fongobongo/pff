import assert from "node:assert/strict";
import { scoreFootball } from "@/lib/stats/football";
import { scoreNfl } from "@/lib/stats/nfl";
import { NFLVERSE_DERIVED_FIELDS, NFLVERSE_MAPPED_FIELDS, type NflTeamRow } from "@/lib/stats/nflverse";
import { NFL_STAT_KEYS } from "@/lib/stats/types";
import {
  buildNflTeamAliasMap,
  computeNflTeamEconomicsRows,
  normalizeNflTeamAbbr,
} from "@/lib/nfl/teamEconomics";
import { type SportfunMarketToken } from "@/lib/sportfunMarket";
import {
  computeInternalFallbackProjection,
  mapSleeperProjectionsByPlayerId,
} from "@/lib/stats/nflProjections";
import { GET as getTeamEconomics } from "@/app/api/stats/nfl/team-economics/route";
import { GET as getStandings } from "@/app/api/stats/nfl/standings/route";
import { GET as getProjections } from "@/app/api/stats/nfl/projections/route";

function nearlyEqual(actual: number, expected: number, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) < epsilon, `Expected ${expected}, got ${actual}`);
}

function runScoringCoverageTests() {
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

  const nflCoverage = new Set<string>([...NFLVERSE_MAPPED_FIELDS, ...NFLVERSE_DERIVED_FIELDS]);
  const nflMissing = NFL_STAT_KEYS.filter((key) => !nflCoverage.has(key));
  assert.ok(
    nflMissing.length === 0,
    `NFL stat keys missing from provider coverage: ${nflMissing.join(", ")}`
  );
}

function runTeamEconomicsUnitTests() {
  const teams: NflTeamRow[] = [
    {
      teamAbbr: "KC",
      teamName: "Kansas City",
      teamNick: "Chiefs",
      conference: "AFC",
      division: "West",
    },
    {
      teamAbbr: "BUF",
      teamName: "Buffalo",
      teamNick: "Bills",
      conference: "AFC",
      division: "East",
    },
  ];

  const aliasMap = buildNflTeamAliasMap(teams);
  assert.equal(normalizeNflTeamAbbr("Kansas City Chiefs", aliasMap), "KC");
  assert.equal(normalizeNflTeamAbbr("Buffalo", aliasMap), "BUF");

  const tokens = [
    {
      tokenIdDec: "1",
      name: "Patrick Mahomes",
      team: "Kansas City",
      position: "QB",
      currentPriceUsdcRaw: "25000000",
      trades24h: 1,
      attributes: [{ trait_type: "Team", value: "Kansas City" }],
    },
    {
      tokenIdDec: "2",
      name: "Travis Kelce",
      team: "KC",
      position: "TE",
      currentPriceUsdcRaw: "12000000",
      trades24h: 1,
      attributes: [{ trait_type: "Team", value: "KC" }],
    },
  ] as SportfunMarketToken[];

  const rows = computeNflTeamEconomicsRows({ teams, tokens });
  const kc = rows.find((row) => row.teamAbbr === "KC");
  assert.ok(kc, "KC row is required");
  assert.equal(kc.tradeablePlayers, 2);
  nearlyEqual(kc.squadValueUsd, 37);
  nearlyEqual(kc.avgPlayerPriceUsd, 18.5);
  assert.equal(kc.topAssets.length, 2);
}

function runProjectionUnitTests() {
  const regular = computeInternalFallbackProjection({
    seasonAvgPpr: 20,
    l3AvgPpr: 24,
    oppPosAllowedAvg: 10,
    leaguePosAllowedAvg: 20,
    games: 6,
  });
  nearlyEqual(regular.projectedPpr, 19.4);
  assert.equal(regular.confidence, "medium");

  const lowGames = computeInternalFallbackProjection({
    seasonAvgPpr: 0,
    l3AvgPpr: 0,
    oppPosAllowedAvg: 18,
    leaguePosAllowedAvg: 15,
    games: 1,
  });
  nearlyEqual(lowGames.projectedPpr, 15);
  assert.equal(lowGames.confidence, "low");

  const clampedPositive = computeInternalFallbackProjection({
    seasonAvgPpr: 12,
    l3AvgPpr: 15,
    oppPosAllowedAvg: 40,
    leaguePosAllowedAvg: 20,
    games: 8,
  });
  nearlyEqual(clampedPositive.oppAdj, 3);

  const sleeperMap = mapSleeperProjectionsByPlayerId({
    gsisToSleeperId: new Map([
      ["00-0001", "100"],
      ["00-0002", "200"],
      ["00-0003", "999"],
    ]),
    projections: {
      "100": { pts_ppr: 17.456 },
      "200": { pts_half_ppr: "11.2" },
      "300": { pts_std: 8 },
    },
  });

  assert.equal(sleeperMap.size, 2);
  nearlyEqual(sleeperMap.get("00-0001") ?? 0, 17.46);
  nearlyEqual(sleeperMap.get("00-0002") ?? 0, 11.2);
}

async function runApiContractTests() {
  const teamEconomicsRes = await getTeamEconomics(
    new Request("http://localhost/api/stats/nfl/team-economics?sort=squad_value&dir=desc")
  );
  assert.equal(teamEconomicsRes.status, 200);
  const teamEconomics = await teamEconomicsRes.json();
  assert.ok(Array.isArray(teamEconomics.rows));
  assert.equal(teamEconomics.sort, "squad_value");
  assert.equal(teamEconomics.dir, "desc");
  type TeamEconomicsRow = { tradeablePlayers: number; squadValueUsd: number };
  const teamRows = teamEconomics.rows as TeamEconomicsRow[];
  assert.ok(teamRows.every((row) => row.tradeablePlayers >= 0));
  assert.ok(teamRows.every((row) => row.squadValueUsd >= 0));

  const projectionsRes = await getProjections(
    new Request(
      "http://localhost/api/stats/nfl/projections?season=2023&week=5&season_type=REG&source=fallback"
    )
  );
  assert.equal(projectionsRes.status, 200);
  const projections = await projectionsRes.json();
  assert.ok(Array.isArray(projections.rows));
  type ProjectionRow = { playerId: string; source: string; isByeWeek: boolean };
  const projectionRows = projections.rows as ProjectionRow[];
  assert.ok(
    projectionRows.every(
      (row) =>
        typeof row.playerId === "string" &&
        ["sleeper", "internal_fallback"].includes(row.source) &&
        typeof row.isByeWeek === "boolean"
    )
  );

  const standingsRes = await getStandings(
    new Request("http://localhost/api/stats/nfl/standings?season=2023&game_type=REG")
  );
  assert.equal(standingsRes.status, 200);
  const standings = await standingsRes.json();
  assert.ok(Array.isArray(standings.rows));
  type StandingRow = {
    wins: number;
    losses: number;
    pointsFor: number;
    pointsAgainst: number;
    tradeablePlayers: number;
    squadValueUsd: number;
    avgPlayerPriceUsd: number;
  };
  const standingRows = standings.rows as StandingRow[];
  assert.ok(
    standingRows.every(
      (row) =>
        typeof row.wins === "number" &&
        typeof row.losses === "number" &&
        typeof row.pointsFor === "number" &&
        typeof row.pointsAgainst === "number" &&
        typeof row.tradeablePlayers === "number" &&
        typeof row.squadValueUsd === "number" &&
        typeof row.avgPlayerPriceUsd === "number"
    )
  );
}

async function main() {
  runScoringCoverageTests();
  runTeamEconomicsUnitTests();
  runProjectionUnitTests();
  await runApiContractTests();
  console.log("stats tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
