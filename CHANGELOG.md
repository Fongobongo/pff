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
  - Added tx inspector endpoint: `GET /api/sportfun/tx/[hash]` (receipt/log decoding)
  - Tx inspector now also decodes Sport.fun events:
    - `PlayerBatchTransfer(address,address,uint256[],uint256[])`
    - `PlayerSharesPromoted(address,uint256[],uint256[])`
  - Tx inspector now also attempts to decode tx call data (function selector -> OpenChain signature lookup)
  - Added `scripts/sportfun_discover.mjs` for contract/topic discovery
  - UI: `/sportfun/portfolio/[address]`, `/sportfun/tx/[hash]`
