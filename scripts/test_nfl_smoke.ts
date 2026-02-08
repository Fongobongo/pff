import assert from "node:assert/strict";

type Check = {
  path: string;
  marker: string;
  profile?: "desktop" | "mobile";
};

const baseUrl = (process.env.NFL_SMOKE_BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const expectSources = (process.env.NFL_SMOKE_EXPECT_SOURCES ?? "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

const userAgents = {
  desktop:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  mobile:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
} as const;

async function fetchText(path: string, profile: "desktop" | "mobile" = "desktop") {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    headers: {
      "user-agent": userAgents[profile],
    },
  });
  const text = await res.text();
  return { url, status: res.status, text, headers: res.headers };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchMarketWithRetry(profile: "desktop" | "mobile", attempts = 4) {
  let last:
    | {
        market: Awaited<ReturnType<typeof fetchText>>;
        json: {
          stats?: {
            metadataSourceCounts?: {
              onchainOnly?: number;
              fallbackOnly?: number;
              hybrid?: number;
              overrideOnly?: number;
              unresolved?: number;
            };
            fallbackFeed?: {
              source?: string;
              staleAgeMs?: number;
            };
          };
          tokens: Array<{ name?: string; team?: string; position?: string }>;
        };
      }
    | null = null;

  for (let i = 0; i < attempts; i += 1) {
    const marketPath = `/api/sportfun/market?sport=nfl&windowHours=24&trendDays=30&maxTokens=120&cacheBust=${Date.now()}-${i}`;
    const market = await fetchText(marketPath, profile);
    if (market.status !== 200) {
      await sleep(300 * (i + 1));
      continue;
    }
    const json = JSON.parse(market.text) as {
      stats?: {
        metadataSourceCounts?: {
          onchainOnly?: number;
          fallbackOnly?: number;
          hybrid?: number;
          overrideOnly?: number;
          unresolved?: number;
        };
        fallbackFeed?: {
          source?: string;
          staleAgeMs?: number;
        };
      };
      tokens: Array<{ name?: string; team?: string; position?: string }>;
    };
    last = { market, json };
    if ((json.tokens?.length ?? 0) > 0) return last;
    await sleep(300 * (i + 1));
  }

  if (last) return last;

  const marketPath = `/api/sportfun/market?sport=nfl&windowHours=24&trendDays=30&maxTokens=120&cacheBust=${Date.now()}-fallback`;
  const market = await fetchText(marketPath, profile);
  const json = JSON.parse(market.text) as {
    stats?: {
      metadataSourceCounts?: {
        onchainOnly?: number;
        fallbackOnly?: number;
        hybrid?: number;
        overrideOnly?: number;
        unresolved?: number;
      };
      fallbackFeed?: {
        source?: string;
        staleAgeMs?: number;
      };
    };
    tokens: Array<{ name?: string; team?: string; position?: string }>;
  };
  return { market, json };
}

async function runPageChecks() {
  const checks: Check[] = [
    { path: "/nfl/teams", marker: "NFL teams", profile: "desktop" },
    { path: "/nfl/standings", marker: "Squad value", profile: "desktop" },
    { path: "/nfl/players", marker: "Matchup", profile: "desktop" },
    { path: "/nfl/players", marker: "Proj PPR", profile: "mobile" },
    {
      path: "/nfl/portfolio?address=0x82c117A68fD47A2d53b997049F4BE44714D57455",
      marker: "NFL portfolio",
      profile: "desktop",
    },
    {
      path: "/nfl/portfolio?address=0x82c117A68fD47A2d53b997049F4BE44714D57455",
      marker: "embedded NFL-only on-chain dashboard",
      profile: "mobile",
    },
    { path: "/nfl/token", marker: "$FUN rewards calculator", profile: "desktop" },
    { path: "/nfl/token", marker: "FUN holding score tiers", profile: "mobile" },
  ];

  for (const check of checks) {
    const { url, status, text } = await fetchText(check.path, check.profile ?? "desktop");
    assert.equal(status, 200, `Expected 200 for ${url}, got ${status}`);
    assert.ok(text.includes(check.marker), `Marker "${check.marker}" not found in ${url}`);
    console.log(`[page] ok ${check.path} (${check.profile ?? "desktop"}) -> ${check.marker}`);
  }
}

async function runApiChecks() {
  const marketResult = await fetchMarketWithRetry("desktop");
  const market = marketResult.market;
  assert.equal(market.status, 200, "market API should return 200");
  const marketJson = marketResult.json;
  assert.ok(Array.isArray(marketJson.tokens), "market tokens must be an array");
  const enrichedCount = marketJson.tokens.filter(
    (token) => Boolean(token.name) && Boolean(token.team) && Boolean(token.position)
  ).length;
  assert.ok(
    enrichedCount > 0,
    "market tokens should include fallback-enriched name/team/position"
  );
  const metaStats = marketJson.stats?.metadataSourceCounts;
  const fallbackFeed = marketJson.stats?.fallbackFeed;
  assert.ok(metaStats, "market stats.metadataSourceCounts should be present");
  assert.ok(fallbackFeed, "market stats.fallbackFeed should be present");
  const fallbackOnly = Number(metaStats?.fallbackOnly ?? 0);
  const hybrid = Number(metaStats?.hybrid ?? 0);
  const unresolved = Number(metaStats?.unresolved ?? 0);
  assert.ok(
    fallbackOnly + hybrid > 0,
    "market metadata stats should indicate fallback/hybrid enrichment"
  );
  assert.ok(unresolved < marketJson.tokens.length, "market metadata should not be unresolved for all tokens");
  assert.ok(
    Boolean(market.headers.get("x-market-fallback-feed-source")),
    "market response must expose fallback feed source header"
  );
  assert.ok(
    Boolean(market.headers.get("x-market-meta-source-fallback")),
    "market response must expose metadata source count headers"
  );
  assert.ok(
    Boolean(market.headers.get("x-market-unresolved-share-pct")),
    "market response must expose unresolved share header"
  );
  console.log(
    `[api] ok /api/sportfun/market enriched=${enrichedCount}/${marketJson.tokens.length} fallback=${fallbackOnly} hybrid=${hybrid} feed=${fallbackFeed?.source ?? "n/a"}`
  );

  const teamEconomics = await fetchText(
    "/api/stats/nfl/team-economics?sort=squad_value&dir=desc",
    "desktop"
  );
  assert.equal(teamEconomics.status, 200, "team-economics API should return 200");
  const teamJson = JSON.parse(teamEconomics.text) as {
    rows: Array<{ tradeablePlayers: number; squadValueUsd: number }>;
  };
  assert.ok(Array.isArray(teamJson.rows), "team-economics rows must be an array");
  assert.ok(teamJson.rows.every((row) => row.tradeablePlayers >= 0), "tradeablePlayers must be >= 0");
  assert.ok(teamJson.rows.every((row) => row.squadValueUsd >= 0), "squadValueUsd must be >= 0");
  assert.ok(
    teamJson.rows.some((row) => row.tradeablePlayers > 0 && row.squadValueUsd > 0),
    "team-economics should have at least one team with non-zero squad value"
  );
  console.log("[api] ok /api/stats/nfl/team-economics");

  const standings = await fetchText("/api/stats/nfl/standings?season=2023&game_type=REG", "desktop");
  assert.equal(standings.status, 200, "standings API should return 200");
  const standingsJson = JSON.parse(standings.text) as {
    rows: Array<{
      wins: number;
      losses: number;
      pointsFor: number;
      pointsAgainst: number;
      tradeablePlayers: number;
      squadValueUsd: number;
      avgPlayerPriceUsd: number;
    }>;
  };
  assert.ok(Array.isArray(standingsJson.rows), "standings rows must be array");
  assert.ok(
    standingsJson.rows.every(
      (row) =>
        typeof row.wins === "number" &&
        typeof row.losses === "number" &&
        typeof row.pointsFor === "number" &&
        typeof row.pointsAgainst === "number" &&
        typeof row.tradeablePlayers === "number" &&
        typeof row.squadValueUsd === "number" &&
        typeof row.avgPlayerPriceUsd === "number"
    ),
    "standings rows missing legacy or fantasy fields"
  );
  console.log("[api] ok /api/stats/nfl/standings");

  const projections = await fetchText(
    "/api/stats/nfl/projections?season=2023&week=5&season_type=REG&source=auto",
    "desktop"
  );
  assert.equal(projections.status, 200, "projections API should return 200");
  const projectionsJson = JSON.parse(projections.text) as {
    rows: Array<{ source: string; playerId: string; isByeWeek: boolean }>;
  };
  assert.ok(Array.isArray(projectionsJson.rows), "projections rows must be array");
  const sources = [...new Set(projectionsJson.rows.map((row) => row.source))].sort();
  if (expectSources.length) {
    const expected = [...expectSources].sort();
    assert.deepEqual(
      sources,
      expected,
      `Expected projection sources ${expected.join(",")}, got ${sources.join(",")}`
    );
  }
  assert.ok(
    projectionsJson.rows.every(
      (row) => typeof row.playerId === "string" && typeof row.isByeWeek === "boolean"
    ),
    "projection rows have invalid shape"
  );
  console.log(`[api] ok /api/stats/nfl/projections sources=${sources.join(",")}`);
}

async function main() {
  console.log(`[smoke] base=${baseUrl}`);
  if (expectSources.length) {
    console.log(`[smoke] expected projection sources=${expectSources.join(",")}`);
  }

  await runPageChecks();
  await runApiChecks();

  console.log("nfl smoke tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
