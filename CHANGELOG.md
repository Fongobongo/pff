# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Repository initialized and pushed to GitHub.
- Initial product requirements captured (Next.js/React fan site for pro.football.fun).
- Notes: blockchain analytics on Base (Ethereum L2) by wallet address; player stats sourced from the web.
- Project language policy: English for project docs, code, and comments.
- Process docs: conversation log + changelog.
- Next.js app scaffold (App Router + TypeScript + Tailwind + ESLint).
- Initial backend scaffolding:
  - Env validation via Zod
  - Base RPC client via viem
  - Postgres access via Drizzle + node-postgres
  - Placeholder API route for wallet portfolio history
- Requirement: use free-tier resources only; aim to minimize external service dependencies (Supabase is an option)
- Requirement: match (at minimum) the feature surface of https://nfl-fun.vercel.app/
- Added research notes and official scoring rules links (docs.sport.fun) for both NFL and Football
- Drafted architecture notes for a minimal-deps / free-tier approach
- Added Etherscan v2 client + Base wallet summary API endpoint (explorer-backed, rate-limit friendly)
- Sport.fun portfolio (WIP):
  - API: `GET /api/sportfun/portfolio/[address]` (holdings from ERC-1155 transfers + best-effort `uri(tokenId)`)
  - Added tx-grouped `activity` with best-effort USDC delta correlation (by tx hash)
  - Added best-effort trade inference for single-token tx (buy/sell + implied price)
  - Added tx inspector endpoint: `GET /api/sportfun/tx/[hash]` (receipt/log decoding)
  - Tx inspector now also decodes Sport.fun events:
    - `PlayerBatchTransfer(address,address,uint256[],uint256[])`
    - `PlayerSharesPromoted(address,uint256[],uint256[])`
  - Tx inspector now also attempts to decode tx call data (function selector -> OpenChain signature lookup)
  - Added `scripts/sportfun_discover.mjs` for contract/topic discovery
  - UI: `/sportfun/portfolio/[address]`, `/sportfun/tx/[hash]`
- Stats scoring pipeline:
  - Normalized NFL + Football stat keys and scoring utilities.
  - Scoring API endpoints: `POST /api/stats/nfl/score` and `POST /api/stats/football/score`.
- Selected free-tier data sources for stats ingestion (NFL: nflverse-data; Football: StatsBomb Open Data; optional fixtures/standings via football-data.org).
- Stats ingestion endpoints:
  - NFL weekly stats: `GET /api/stats/nfl/weekly` (nflverse-data).
  - Football competitions/matches/match-stats: `/api/stats/football/competitions`, `/api/stats/football/matches`, `/api/stats/football/match-stats` (StatsBomb Open Data).
- Added `npm run test:stats` to validate scoring logic (tsx-based).
- Expanded StatsBomb mapping coverage (big chances, clean sheets/goals conceded, GK inside/outside box, error-to-shot/goal heuristics).
- Added football match-to-score endpoint: `GET /api/stats/football/score-from-match`.
- Added time-on-pitch goals conceded/clean sheet logic, penalty-assist heuristics, and auto competition tier mapping for football scoring.
- Added `GET /api/stats/nfl/score-week` and `GET /api/stats/football/score-competition` endpoints.
- Added basic football stats pages (competitions, matches, match scores).
- Improved penalty-assist heuristics using possession/time matching for penalty shots.
- Added football-data.org fixtures/standings endpoints and basic UI pages.
- Added NFL weekly scores page (`/nfl`) and linked it from the home page.
- Added NFL player history endpoint/UI (`/api/stats/nfl/player`, `/nfl/player/[playerId]`).
- Added football-data.org pagination + tier mapping and cached fetches.
- Added NFL player filters (season/week/season_type) and football tournament summary endpoint/UI.
- Added select-based NFL player filters with paging, tournament summary caching, and a tier mapping settings page.
- Added async football tournament summary jobs with status polling + CSV export.
- Added NFL player history CSV export.
- Added football-data.org fixtures → StatsBomb match bridge (`/api/football-data/score-from-fixtures`).
- Added score-from-fixtures UI page with match status + unmatched highlighting.
- Persisted tournament summary job status to Postgres when `DATABASE_URL` is set.
- Improved fixture/team matching with aliases and similarity scoring.
- Added match scoring fallback + tie-break rules for ambiguous fixtures.
- Expanded league-specific team alias maps for fixture matching.
- Sport.fun athlete metadata base config via `SPORTFUN_ATHLETE_METADATA_BASE` (supports `{id}` template).
- Shared Sport.fun ERC-1155 metadata resolver + cache template tracking.
- Added `scripts/sportfun_metadata_probe.mjs` for probing `uri()` metadata sources.
- Added caching and concurrency override for `GET /api/stats/football/score-competition`.

### Changed
- Fixed server-side API fetching to derive the deployment base URL (Vercel env/headers) instead of hardcoded localhost or relative URLs.
- Removed the temporary `ALEMBIC_API_KEY` alias; only `ALCHEMY_API_KEY` is supported.
- Reduced redundant full-scan retries and skipped price lookups on paged Sport.fun activity requests.
- Added Sport.fun ERC-1155 metadata fetching from `uri(tokenId)` JSON (including IPFS) and displayed names/images in holdings.
- Added economic realized PnL that counts trade proceeds even when redirected to another recipient.
- Added mismatch diagnostics with residual ERC-1155 deltas in the Sport.fun portfolio UI.
- Updated project plan (Step 3 complete, Step 4 stats ingestion + scoring active).
- Added stats normalization doc with full Sport.fun scoring matrices and edge-case notes.
- Refined stats normalization with verified Sport.fun scoring rules and edge cases.
- Sport.fun portfolio:
  - Pricing/valuation: added `currentValueAllHoldingsUsdcRaw` and `holdingsPricedCount`.
  - Analytics: promotions are treated as free shares (zero cost) in the moving-average cost basis ledger.
  - Trade decoding is now wallet-centric (only keeps decoded items that affect the target wallet's share balance).
  - USDC delta is computed from receipt `Transfer` logs when receipts are available (more reliable than transfer correlation by tx hash).
  - Added debug/sanity checks for decoded share deltas vs ERC-1155 deltas (mismatch counters + samples).
  - Added basic counters for edge cases (gift buys, sells where proceeds go to another recipient).
- Added activity pagination via `activityCursor` and a local decoded-receipt cache (memory + disk) to reduce receipt decoding overhead.
- Sport.fun metadata fetching now handles numeric `uri()` values with a base-template fallback.
- Fixed a stray brace in StatsBomb match stats parsing that broke TypeScript parsing.
