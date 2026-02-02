# Work in Progress

## Now
- **Step 4 (Stats ingestion + scoring):** NFL + Football ingestion endpoints exist, plus match-to-score + competition scoring for football. Mapping coverage improved with heuristics; remaining gaps are mostly niche GK actions not present in open data.
  - NFL weekly + player detail pages live; football fixtures/standings (football-data.org) wired with caching + pagination.
  - Tournament summary endpoint added for football competitions; NFL player filters wired in UI.
  - Tournament summary defaults to all matches with async job tracking + CSV export (DB-backed when configured).
  - football-data.org tier mapping overrides exposed via config UI; fixtures can map to score-from-match.
  - Added fixtures → score-from-match UI and improved team matching heuristics (score-based fallback + tie-breaks + league aliases).

## Next
- Stats ingestion:
  - Confirm scoring matrices vs provider field mapping (NFL + Football).
  - Identify free-tier data sources and constraints.
  - Build ingestion endpoints + caching for stat feeds.
  - Add per-sport scoring tests to validate normalization.
- NFL parity plan (from nfl-fun.vercel.app gap list):
  - **Stage 0**: confirm scope (full parity vs stubs) and definition of “done”.
  - **Stage 1**: add UI shells + navigation for missing routes:
    - `/nfl/players`, `/nfl/teams`, `/nfl/standings`, `/nfl/portfolio`, `/nfl/token`
    - `/nfl/trending`, `/nfl/analytics`, `/nfl/advanced-stats`
    - `/nfl/opportunities`, `/nfl/matchups`, `/nfl/defensive-matchups`
    - `/nfl/tournament-summary`, `/nfl/tournament-matrix`
  - **Stage 2**: add core NFL data APIs (players/teams/standings/schedule) and wire to pages.
  - **Stage 3**: derive advanced pages (trending/analytics/matchups/opportunities).
  - **Stage 4**: tournament summary + matrix (aggregates from weekly stats + scoring).
  - **Stage 5**: portfolio/token pages (pending source confirmation).

## Status
- Last updated: 2026-02-02
- Step 4 (Stats ingestion + scoring) started:
  - Added NFL + Football scoring library with normalized stat keys and result bonuses.
  - Added scoring API endpoints: `/api/stats/nfl/score` and `/api/stats/football/score`.
  - Added ingestion endpoints for NFL weekly stats and StatsBomb open data.
  - Added basic scoring tests.
  - Added football match-to-score endpoint and expanded StatsBomb mapping coverage.
  - Added NFL score-week endpoint and football competition scoring endpoint.
  - Added football-data.org fixtures/standings endpoints and basic NFL/football pages.
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
