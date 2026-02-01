# Work in Progress

## Now
- **Step 3 (Sport.fun portfolio):** harden trade semantics + performance.

## Next
- Performance hardening:
  - Add paging / cursors for `activity` (avoid fetching/decoding hundreds of receipts in one request).
  - Add a lightweight cache for decoded receipts by tx hash (DB or file-based for dev).
- Semantics hardening:
  - Decide how to represent “economic” PnL vs wallet cashflow (e.g., sells where proceeds go to another recipient).
  - Expand mismatch diagnostics (surface which tokenIds/contracts mismatch and why).
- Metadata:
  - Map ERC-1155 `tokenId` -> player metadata by fetching/parsing `uri(uint256)` JSON (IPFS/http) and display name/image.

## Status
- Last updated: 2026-02-01
- Portfolio endpoint + UI exist and support:
  - Holdings from ERC-1155 transfers (filtered to known Sport.fun ERC-1155 contracts).
  - Tx-grouped activity.
  - Authoritative trade decoding via FDFPairV2 events + promotions via DevelopmentPlayers.
  - Pricing via `FDFPair.getPrices(tokenIds)`.
  - WIP analytics (moving-average cost basis) with promotions treated as free shares.
  - Sanity checks to compare decoded share deltas to ERC-1155 deltas.
