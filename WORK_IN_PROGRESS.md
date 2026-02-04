# Work in Progress

## Now
- **Step 5 (Soccer analytics + market expansion):** Expand StatsBomb competition coverage for soccer pages and improve Sport.fun market breadth (include inactive tokens + richer metadata).
  - Add more competitions/seasons to the soccer analytics selectors.
  - Enrich market snapshot with more metadata for low-activity tokens.
  - Revisit sport summary pages after competition expansion.

## Next
- Expand soccer leaderboards (xG/xA, assists, defenders) across more competitions.
- Improve Sport.fun token universe coverage (inactive tokens, promotions-only IDs).
- Run `npm run build` + smoke checks on core pages (NFL/Soccer/Sport.fun).

## Status
- Last updated: 2026-02-04
- Step 4 (Stats ingestion + scoring) completed:
  - Added NFL + Football scoring library with normalized stat keys and result bonuses.
  - Added scoring API endpoints: `/api/stats/nfl/score` and `/api/stats/football/score`.
  - Added ingestion endpoints for NFL weekly stats and StatsBomb open data.
  - Added basic scoring tests + provider coverage checks.
  - Added football match-to-score endpoint and expanded StatsBomb mapping coverage.
  - Added NFL score-week endpoint and football competition scoring endpoint.
  - Added football-data.org fixtures/standings endpoints and basic NFL/football pages.
- Step 5 (Soccer analytics + market expansion) started:
  - Adding more StatsBomb competitions to soccer analytics pages.
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
- NFL parity plan (nfl-fun.vercel.app) completed:
  - Market Overview (market cap, sentiment, range/spread, trend filters, position breakdown, inactive tokens).
  - Players (season/weekly modes, TP metrics, L3, ranks, pricing).
  - Trending (L3 metrics, trend score, filters).
  - Advanced Stats tabs (efficiency/volume/red zone/advanced/tournament).
  - Opportunities, Matchups, Analytics, Signals pages.
  - Sport.fun token ↔ NFL player mapping with metadata enrichment.
