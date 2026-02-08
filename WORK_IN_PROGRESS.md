# Work in Progress

## Now
- **NFL core parity hardening (post-implementation):** monitor production behavior for new endpoints/UI blocks and track provider fallback rate (`Sleeper -> internal_fallback`).

## Next
- Add targeted UI regression pass for `/nfl/players`, `/nfl/standings`, `/nfl/teams`, `/nfl/portfolio`, `/nfl/token` on mobile breakpoints.
- Decide whether to migrate token logo `<img>` blocks to `next/image` (currently lint warning only).
- Add optional lightweight telemetry around projections source mix and projection cache hit-rate.

## Status
- Last updated: 2026-02-07
- Build + checks completed:
  - `npm run test:stats`
  - `npm run lint` (no errors; 2 existing `<img>` warnings)
  - `npm run build`
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
