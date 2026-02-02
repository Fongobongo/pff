# Conversation Log (EN)

This file tracks key decisions and requirements from our chats.

## 2026-01-31

- Created a new `pff` project directory and initialized a git repository.
- Added basic repo files: `README.md`, `.gitignore`, and an initial commit.
- Connected GitHub remote and pushed branch `main` to: https://github.com/Fongobongo/pff
- Project definition: a React/Next.js fan site for the game **pro.football.fun**.
- Requirements:
  - Blockchain: **Base** (Ethereum L2). We need to analyze a player's portfolio history by wallet address.
  - Player stats: must be pulled from the internet; includes **all data points used by the game to calculate points**.
  - Scope: “everything” (full solution, not just frontend).
- Policies:
  - Keep chat history and a project changelog in separate files, **English only**, committed to git.
  - The entire project must be in **English**, including code and comments.
  - Dev runs on a VPS (Debian 12) and production deploy is Vercel (or Netlify).
  - All resources must be free-tier (hosting, DB, APIs).
  - Supabase is an option, but we prefer to depend on as few external services as possible.
- Reference scope: the project must include at least the same features as https://nfl-fun.vercel.app/
- Scope update: build both sports (NFL + Football/soccer).
- Provided a test wallet address (Pro user): 0x82c117A68fD47A2d53b997049F4BE44714D57455
- Confirmed requirements: in-game user portfolio by wallet + athlete stats with history.
- User created an Etherscan API v2 key and set ETHERSCAN_API_KEY (rate limit: 3 req/s) for Base explorer-backed history.
- User added an Alchemy API key (rate limit: 25 req/s) to enable Base wallet history via Alchemy Enhanced APIs.
- Requirement: find scoring/stats rules in the game's wiki (we can use https://docs.sport.fun as the accessible official docs source).
- Cloudflare blocks Sport.fun HTTP APIs from server-side usage; in-game portfolio must be reconstructed from on-chain activity.
- Sport.fun portfolio work (WIP):
  - Identified two ERC-1155 contracts observed in the test wallet's history:
    - `0x71c8b0c5148edb0399d1edf9bf0c8c81dea16918`
    - `0x2eef466e802ab2835ab81be63eebc55167d35b56`
  - Implemented `GET /api/sportfun/portfolio/[address]`:
    - Pulls ERC-1155 transfers via Alchemy Enhanced APIs
    - Computes net balances per (contract, tokenId)
    - Best-effort calls `uri(uint256)` for each held tokenId
  - Added UI page `/sportfun/portfolio/[address]` and linked it from the home page.
  - Added tx-grouped activity with best-effort USDC delta correlation (joined by tx hash).
  - Added a tx inspector (`/sportfun/tx/[hash]`) + API (`/api/sportfun/tx/[hash]`) to decode receipts/logs and identify unknown contract events.
  - Resolved two recurring unknown topic0 values via OpenChain signature DB:
    - `0xb9d06178...` => `PlayerBatchTransfer(address,address,uint256[],uint256[])`
    - `0xdf85ea72...` => `PlayerSharesPromoted(address,uint256[],uint256[])`
- Sport.fun portfolio updates:
  - Added pricing-based total value for all priced holdings (`currentValueAllHoldingsUsdcRaw`) and a priced-count metric.
  - Improved cost basis tracking by incorporating promotions as free shares (zero cost).
  - Refined trade semantics using authoritative FDFPairV2 events:
    - Wallet-centric decoding (keeps only trades/promotions that affect the target wallet's share deltas).
    - USDC delta derived from receipt `Transfer` logs when available.
    - Added sanity checks to compare decoded share deltas against ERC-1155 deltas (mismatch counts + samples).
    - Added counters for edge cases (gift buys; sells where proceeds are sent to a different recipient).

## 2026-02-01

- Agreed to implement performance hardening first.
- Added local decoded-receipt cache (memory + disk) for Sport.fun portfolio activity.
- Added activity cursor support to page transaction activity results.

## 2026-02-02

- Investigated Vercel runtime failures: server components were calling API routes via hardcoded localhost or relative URLs.
- Added a server-only base URL helper that derives the origin from Vercel env or request headers.
- Updated `/base/[address]` and `/sportfun/tx/[hash]` pages to use the new base URL helper when fetching API data.
- Removed the temporary `ALEMBIC_API_KEY` alias; require `ALCHEMY_API_KEY`.
- Tweaked Sport.fun activity pagination to avoid redundant full scans and skip price fetching on paged activity requests.
- Added ERC-1155 metadata fetching from `uri(tokenId)` JSON (IPFS/http) and surfaced player names/images in the holdings table.
- Added economic realized PnL (trade proceeds regardless of recipient) alongside cashflow-based realized PnL.
- Surfaced mismatch diagnostics with sample tokenId/contract deltas and residuals in the Sport.fun portfolio UI.
- Marked Step 3 complete and moved the active plan to stats ingestion + scoring (NFL + Football).
- Added `docs/STATS_NORMALIZATION.md` with full scoring matrices, positional modifiers, and edge-case notes; linked it from research notes.
- Refined stats normalization with verified Sport.fun scoring rules, edge cases, and competition tier notes.
- Added a normalized stats scoring library for NFL + Football, including win/draw bonuses for football.
- Added scoring API endpoints: `POST /api/stats/nfl/score` and `POST /api/stats/football/score`.
- Selected free-tier data sources: nflverse-data (NFL), StatsBomb Open Data (football), with football-data.org as optional fixtures/standings.
- Added ingestion endpoints:
  - NFL weekly stats: `GET /api/stats/nfl/weekly`.
  - Football competitions/matches/match-stats: `/api/stats/football/competitions`, `/api/stats/football/matches`, `/api/stats/football/match-stats`.
- Added basic scoring tests via `npm run test:stats` (tsx-based).
- Expanded StatsBomb mapping coverage (big chances, clean sheets/goals conceded, error-to-shot/goal heuristics, GK inside/outside box) and added `GET /api/stats/football/score-from-match`.
- Added penalty-assist heuristics, time-on-pitch goals conceded/clean sheet logic, and auto competition tier mapping for `score-from-match`.
- Added `GET /api/stats/nfl/score-week` and `GET /api/stats/football/score-competition`, plus basic football stats pages.
- Improved penalty-assist heuristics (possession/time matching) and added football-data.org fixtures/standings endpoints + UI pages.
- Added an NFL weekly scores page (`/nfl`) and linked it from the home page.
- Added NFL player history endpoint + UI, football-data.org pagination/tier mapping, and cached fixtures/standings.
- Added NFL player filters (season/week/season_type), tournament summary endpoint + page, and expanded football-data tier mapping.
- Added NFL player select-based filters + pagination, tournament summary caching, and a tier mapping settings page.
- Added async football tournament summary jobs with status polling + CSV export.
- Added NFL player history CSV export.
- Added football-data.org fixtures → StatsBomb score bridge endpoint (`/api/football-data/score-from-fixtures`).
