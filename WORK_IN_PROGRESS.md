# Work in Progress

## Now
- **Step 3 (Sport.fun portfolio)**: finalize the on-chain data model and confirm trade semantics.

## Next
- Map ERC-1155 `tokenId` → player/asset metadata (via `uri(uint256)` and its base mapping).
- Correlate ERC-1155 transfers with USDC transfers to infer buys/sells + price per share (now adds best-effort inference for single-token tx).
- Add tx inspector to decode receipts/logs and discover contract/event model.
- Expand `/api/sportfun/portfolio/[address]` to include trade history (tx-based).

## Status
- Last updated: 2026-01-31
- Implemented initial WIP endpoint + UI page:
  - `GET /api/sportfun/portfolio/[address]` (holdings from ERC-1155 transfers + best-effort `uri(tokenId)`)
  - `activity` (tx-grouped): best-effort USDC delta + ERC-1155 deltas by tx hash
  - `/sportfun/portfolio/[address]`
- Added tx inspector:
  - `GET /api/sportfun/tx/[hash]`
  - `/sportfun/tx/[hash]`
- Currently filtering to two observed Sport.fun ERC-1155 contracts:
  - `0x71c8b0c5148edb0399d1edf9bf0c8c81dea16918`
  - `0x2eef466e802ab2835ab81be63eebc55167d35b56`
- Discovered Sport.fun event signatures (topic0 → name):
  - `0xb9d06178...` → `PlayerBatchTransfer(address,address,uint256[],uint256[])` (emitted by the ERC-1155 contracts; 2 indexed addresses)
  - `0xdf85ea72...` → `PlayerSharesPromoted(address,uint256[],uint256[])` (emitted by:
    - `0xc21c2d586f1db92eedb67a2fc348f21ed7541965`
    - `0xc98bf3fc49a8a7ad162098ad0bb62268d46dacf9`
    )
- Confirmed via receipt decoding that ids match tokenIds and values match the ERC-1155 transfer amounts (18-decimal fixed point).
- Confirmed `baseURI()` currently returns empty string for both ERC-1155 player proxies.
