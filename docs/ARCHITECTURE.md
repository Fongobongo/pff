# Architecture (Draft)

## Goals

- Support **two sports**: NFL and Football (soccer).
- Prefer **free-tier** resources and minimize external dependencies.
- Keep the codebase and docs **English-only**.

## Suggested approach

### Data ingestion

- Use server-side route handlers (`/src/app/api/...`) to:
  - fetch external data (stats, matchups, tournaments)
  - normalize it into our internal schemas
  - cache results (initially in-memory, later persistent if required)

### Caching / persistence strategy

Phase 1 (MVP, minimal deps):
- No external DB.
- Use short-lived caching (in-memory + HTTP cache headers) for public pages.

Phase 2 (when we need historical queries, portfolio history indexing, or heavier analytics):
- Add Postgres via **Supabase** (free tier) as the primary DB.

### Blockchain analytics (Base)

- Use `viem` for RPC reads.
- Prefer indexer-style endpoints (free tier where possible) rather than scanning blocks.

## Feature parity target

We must reach at least the same feature surface as https://nfl-fun.vercel.app/ for both sports where applicable (market overview, players, player detail, portfolio tracking, analytics pages).
