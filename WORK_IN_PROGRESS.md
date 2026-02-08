# Work in Progress

## Now
- **NFL market telemetry + resilience hardening:** track metadata source mix and keep enrichment alive via stale snapshot fallback when upstream feed degrades.

## Next
- Deploy telemetry/stale-fallback update to production and verify headers/stats on live endpoints.
- Consider surfacing market metadata-source telemetry in UI/debug panel (currently API-only).
- Add optional alert thresholds for unresolved metadata share if it spikes.

## Status
- Last updated: 2026-02-08
- Build + checks completed:
  - `npm run test:stats`
  - `npx eslint src/lib/nfl/nflFunFallback.ts src/lib/sportfunMarket.ts src/lib/nfl/teamEconomics.ts scripts/test_nfl_smoke.ts scripts/report_nfl_health.ts scripts/test_stats.ts src/lib/env.ts`
  - `npm run build`
  - `NFL_SMOKE_BASE_URL=http://localhost:3100 npm run test:nfl-smoke`
  - `NFL_HEALTH_BASE_URL=http://localhost:3100 npm run report:nfl-health`
  - `NFL_MOBILE_BASE_URL=http://localhost:3100 npm run test:nfl-mobile`
- Data-quality gap fix completed:
  - Added fallback module: `src/lib/nfl/nflFunFallback.ts`.
  - `src/lib/sportfunMarket.ts` now enriches NFL tokens from fallback (`name/team/position/isTradeable/supply`) when on-chain metadata is missing.
  - Added env support: `NFL_FUN_PLAYERS_DATA_URL` (`src/lib/env.ts`, `.env.example`).
  - Team alias normalization extended (`JAC -> JAX`, `LA -> LAR`, `WSH -> WAS`) and non-tradeable tokens excluded in economics aggregation (`src/lib/nfl/teamEconomics.ts`).
  - Updated smoke/health checks to assert enrichment and non-zero team economics.
- Telemetry and resilience updates completed:
  - Added metadata source counters and fallback feed status to `SportfunMarketSnapshot.stats`.
  - Added market telemetry headers in `GET /api/sportfun/market`:
    - `x-market-meta-source-onchain`
    - `x-market-meta-source-fallback`
    - `x-market-meta-source-hybrid`
    - `x-market-meta-source-override`
    - `x-market-meta-source-unresolved`
    - `x-market-fallback-feed-source`
    - `x-market-fallback-feed-stale-age-ms`
  - Added stale snapshot fallback in `src/lib/nfl/nflFunFallback.ts` (serves last successful dataset if upstream fails within max stale window).
  - Added bundled fallback dataset `src/lib/nfl/nflFunFallback.snapshot.json` for serverless environments where upstream feed is unreachable.
  - `src/lib/sportfunMarket.ts` now falls back to NFL fallback token IDs when on-chain token universe is temporarily empty, and tolerates price fetch failures by returning degraded-but-non-empty snapshots.
  - Added targeted mobile regression script: `scripts/test_nfl_mobile_regression.ts` (`npm run test:nfl-mobile`).
  - Stabilized prod smoke/health scripts against stale edge cache artifacts via cache-busting market query param.
- NFL core gaps (relative to selected `nfl-fun` scope) implemented:
  - **Phase 1:** Team economics + standings fantasy fields.
    - New module: `src/lib/nfl/teamEconomics.ts`.
    - New API: `/api/stats/nfl/team-economics`.
    - Standings API extended with `tradeablePlayers`, `squadValueUsd`, `avgPlayerPriceUsd`, `topAssets`.
    - Teams/Standings pages updated with fantasy columns, sorting and filters.
  - **Phase 2:** Player matchup + projection + player linking.
    - New projections service: `src/lib/stats/nflProjections.ts`.
    - New API: `/api/stats/nfl/projections`.
    - Sleeper adapter + deterministic internal fallback formula + graceful degradation.
    - Players page updated with clickable player names, `Matchup`, `Proj PPR`, `proj_ppr_desc|asc`, and BYE handling.
  - **Phase 3:** Embedded NFL portfolio.
    - Extracted shared dashboard: `src/components/portfolio/SportfunPortfolioDashboard.tsx`.
    - `/sportfun/portfolio/[address]` converted to thin wrapper over shared component.
    - `/nfl/portfolio` now supports `?address=0x...` and renders embedded NFL-only dashboard.
    - Added NFL-focused blocks: `Total Value`, `Realized/Unrealized PnL`, `Position Breakdown`, `Team Exposure`, `Transaction History` filtering.
    - Preserved `Export CSV`, token history links, and `Run full scan`.
  - **Phase 4:** `$FUN` rewards + calculator.
    - New rewards module: `src/lib/funRewards.ts`.
    - Added rewards blocks and calculator UI on `/nfl/token`.
    - Tier config supports optional env override via `FUN_REWARD_TIERS_JSON`.
- Environment/config updates:
  - Added `SLEEPER_PROJECTIONS_ENABLED` and `FUN_REWARD_TIERS_JSON` support in `src/lib/env.ts` + `.env.example`.
- Test coverage updates in `scripts/test_stats.ts`:
  - Unit tests for team alias normalization/aggregation.
  - Unit tests for fallback projection formula and clamp behavior.
  - Unit test for Sleeper `gsis_id` mapping.
  - API contract checks for team-economics, projections, and extended standings.
