# Work in Progress

## Now
- **Step 3 (Sport.fun portfolio)**: finalize the on-chain data model and confirm trade semantics.

## Next
- Map ERC-1155 `tokenId` → player/asset metadata (via `uri(uint256)` and its base mapping).
- Correlate ERC-1155 transfers with USDC transfers to infer buys/sells + price per share.
- Expand `/api/sportfun/portfolio/[address]` to include trade history (tx-based).

## Status
- Last updated: 2026-01-31
- Implemented initial WIP endpoint + UI page:
  - `GET /api/sportfun/portfolio/[address]` (holdings from ERC-1155 transfers + best-effort `uri(tokenId)`)
  - `activity` (tx-grouped): best-effort USDC delta + ERC-1155 deltas by tx hash
  - `/sportfun/portfolio/[address]`
- Currently filtering to two observed Sport.fun ERC-1155 contracts:
  - `0x71c8b0c5148edb0399d1edf9bf0c8c81dea16918`
  - `0x2eef466e802ab2835ab81be63eebc55167d35b56`
