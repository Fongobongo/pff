import assert from "node:assert/strict";

type MobileCheck = {
  path: string;
  markers: string[];
};

const baseUrl = (process.env.NFL_MOBILE_BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const mobileUserAgent =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const forbiddenSnippets = [
  "Application error",
  "Internal Server Error",
  "Unhandled Runtime Error",
];

async function fetchPage(path: string) {
  const url = `${baseUrl}${path}`;
  const started = Date.now();
  const res = await fetch(url, {
    headers: {
      "user-agent": mobileUserAgent,
      accept: "text/html",
    },
  });
  const text = await res.text();
  const elapsedMs = Date.now() - started;
  return { url, status: res.status, text, elapsedMs };
}

async function main() {
  console.log(`[mobile] base=${baseUrl}`);

  const checks: MobileCheck[] = [
    {
      path: "/nfl/players",
      markers: ["NFL players", "Proj PPR", "Matchup"],
    },
    {
      path: "/nfl/standings",
      markers: ["NFL standings", "Squad value"],
    },
    {
      path: "/nfl/teams",
      markers: ["NFL teams", "Top 3 assets"],
    },
    {
      path: "/nfl/alerts",
      markers: ["NFL alerts", "All alerts", "Sink"],
    },
    {
      path: "/nfl/portfolio?address=0x82c117A68fD47A2d53b997049F4BE44714D57455",
      markers: ["NFL portfolio", "embedded NFL-only on-chain dashboard", "Open NFL portfolio"],
    },
    {
      path: "/nfl/token",
      markers: ["$FUN token", "$FUN rewards calculator", "FUN holding score tiers"],
    },
  ];

  for (const check of checks) {
    const { url, status, text, elapsedMs } = await fetchPage(check.path);
    assert.equal(status, 200, `Expected 200 for ${url}, got ${status}`);
    assert.ok(text.includes('name="viewport"'), `Missing viewport meta: ${url}`);
    for (const marker of check.markers) {
      assert.ok(text.includes(marker), `Missing marker "${marker}" in ${url}`);
    }
    for (const forbidden of forbiddenSnippets) {
      assert.ok(!text.includes(forbidden), `Unexpected "${forbidden}" in ${url}`);
    }
    console.log(`[mobile] ok ${check.path} latencyMs=${elapsedMs}`);
  }

  console.log("nfl mobile regression checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
