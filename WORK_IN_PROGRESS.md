# Work in Progress

## Now
- **Step 4 (Stats ingestion + scoring):** scoring library + API endpoints exist; ingestion endpoints are in place for NFL (nflverse weekly) + Football (StatsBomb). Mapping coverage is partial; remaining fields + tests still pending.

## Next
- Stats ingestion:
  - Confirm scoring matrices vs provider field mapping (NFL + Football).
  - Identify free-tier data sources and constraints.
  - Build ingestion endpoints + caching for stat feeds.
  - Add per-sport scoring tests to validate normalization.

## Status
- Last updated: 2026-02-02
- Step 4 (Stats ingestion + scoring) started:
  - Added NFL + Football scoring library with normalized stat keys and result bonuses.
  - Added scoring API endpoints: `/api/stats/nfl/score` and `/api/stats/football/score`.
  - Added ingestion endpoints for NFL weekly stats and StatsBomb open data.
  - Added basic scoring tests.
- Step 3 (Sport.fun portfolio) completed:
  - Activity pagination + cursors to avoid large receipt decode bursts.
  - Decoded-receipt cache (memory + disk) for speed and rate-limit relief.
  - Economic vs cashflow realized PnL split.
  - Mismatch diagnostics surfaced with residual ERC-1155 deltas.
  - ERC-1155 `uri(tokenId)` metadata fetch + display (name/image).
- Portfolio endpoint + UI exist and support:
  - Holdings from ERC-1155 transfers (filtered to known Sport.fun ERC-1155 contracts).
  - Tx-grouped activity.
  - Authoritative trade decoding via FDFPairV2 events + promotions via DevelopmentPlayers.
  - Pricing via `FDFPair.getPrices(tokenIds)`.
  - WIP analytics (moving-average cost basis) with promotions treated as free shares.
  - Sanity checks to compare decoded share deltas to ERC-1155 deltas.
