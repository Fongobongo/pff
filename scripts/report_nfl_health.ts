import assert from "node:assert/strict";

type JsonAny = Record<string, unknown>;

const baseUrl = (process.env.NFL_HEALTH_BASE_URL ?? "https://sports-fun.vercel.app").replace(/\/$/, "");
const season = Number(process.env.NFL_HEALTH_SEASON ?? "2023");
const week = Number(process.env.NFL_HEALTH_WEEK ?? "5");
const seasonType = (process.env.NFL_HEALTH_SEASON_TYPE ?? "REG").toUpperCase();

async function fetchText(path: string) {
  const url = `${baseUrl}${path}`;
  const started = Date.now();
  const res = await fetch(url);
  const text = await res.text();
  const elapsedMs = Date.now() - started;
  return { url, res, text, elapsedMs };
}

function readHeaderNumber(headers: Headers, key: string): number | null {
  const value = headers.get(key);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function checkPage(path: string, marker: string) {
  const { url, res, text, elapsedMs } = await fetchText(path);
  assert.equal(res.status, 200, `Expected 200: ${url}`);
  assert.ok(text.includes(marker), `Missing marker "${marker}": ${url}`);
  return { path, elapsedMs, status: res.status };
}

async function checkJson(path: string) {
  const { url, res, text, elapsedMs } = await fetchText(path);
  assert.equal(res.status, 200, `Expected 200: ${url}`);
  const json = JSON.parse(text) as JsonAny;
  return { path, elapsedMs, status: res.status, json, headers: res.headers };
}

async function main() {
  console.log(`[health] base=${baseUrl}`);
  console.log(`[health] projection target season=${season} week=${week} seasonType=${seasonType}`);

  const pages = await Promise.all([
    checkPage("/nfl/teams", "NFL teams"),
    checkPage("/nfl/standings", "NFL standings"),
    checkPage("/nfl/players", "NFL players"),
    checkPage("/nfl/portfolio?address=0x82c117A68fD47A2d53b997049F4BE44714D57455", "NFL portfolio"),
    checkPage("/nfl/token", "$FUN token"),
  ]);

  const projections = await checkJson(
    `/api/stats/nfl/projections?season=${season}&week=${week}&season_type=${seasonType}&source=auto`
  );
  const standings = await checkJson(`/api/stats/nfl/standings?season=${season}&game_type=${seasonType}`);
  const economics = await checkJson(`/api/stats/nfl/team-economics?sort=squad_value&dir=desc`);

  const projectionRows = (projections.json.rows as unknown[]) ?? [];
  const projectionStats = (projections.json.stats as JsonAny | undefined) ?? {};
  const sourceCounts = (projectionStats.sourceCounts as JsonAny | undefined) ?? {};

  console.log("\n[pages]");
  for (const page of pages) {
    console.log(`- ${page.path}: status=${page.status} latencyMs=${page.elapsedMs}`);
  }

  console.log("\n[api]");
  console.log(
    `- ${projections.path}: status=${projections.status} latencyMs=${projections.elapsedMs} rows=${projectionRows.length}`
  );
  console.log(
    `  sourceCounts(sleeper=${sourceCounts.sleeper ?? "n/a"}, fallback=${sourceCounts.fallback ?? "n/a"}) fallbackRatio=${projectionStats.fallbackRatio ?? "n/a"}`
  );
  console.log(
    `  headers latency=${readHeaderNumber(projections.headers, "x-projections-latency-ms") ?? "n/a"} fallbackRatio=${projections.headers.get("x-projections-fallback-ratio") ?? "n/a"}`
  );

  const standingsRows = (standings.json.rows as unknown[]) ?? [];
  const economicsRows = (economics.json.rows as unknown[]) ?? [];

  console.log(`- ${standings.path}: status=${standings.status} latencyMs=${standings.elapsedMs} rows=${standingsRows.length}`);
  console.log(`- ${economics.path}: status=${economics.status} latencyMs=${economics.elapsedMs} rows=${economicsRows.length}`);

  console.log("\nnfl health report passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
