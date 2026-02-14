# TODO: Missing Features vs https://nfl-fun.vercel.app

Дата проверки: 2026-02-14

## 1) Soccer player details missing
- [x] Add dynamic route `/soccer/players/[playerId]`
  - Example existing on prod: `/soccer/players/00661683-b4e1-4767-8a4f-5bd31a44ec0e`
  - Expected file: `src/app/soccer/players/[playerId]/page.tsx`

## 2) Global shell/UI parity with prod is missing
- [x] Theme toggle (light/dark) in global layout
- [x] Top status bar with `Data updated: ...`
- [x] Shared footer with disclaimer
- [ ] Landing page parity with prod hero/cards (root route `/`)

## 3) Optional consistency checks after implementation
- [x] Verify status `200` for `/soccer/players/[playerId]`
  - Verified locally on 2026-02-14: `GET /soccer/players/00661683-b4e1-4767-8a4f-5bd31a44ec0e` -> `200`

## 4) Missing features vs `https://tenero.io` (`sports.fun`)
- [ ] Add route `/sportsfun` (sports.fun hub page)
  - Scope: chain-level overview cards and stats (volume, netflow, active traders, top market)
- [ ] Add route `/sportsfun/tokens` (token screener)
  - Scope: unified token table with filters/sorting/timeframe (`Price`, `Mcap`, `Holders`, `Pools`, `Txs`)
- [ ] Add route `/sportsfun/pools` (pool screener)
  - Scope: pool-level table with liquidity/holders/tx metrics and filters
- [ ] Add route `/sportsfun/market` (market flow analytics)
  - Scope: `Top inflows`, `Top outflows`, `Whale trades`, `Market net flow`
- [ ] Add route `/sportsfun/tracker` (wallet tracker module)
  - Scope: tracked wallets, wallet groups, wallet remarks, grouped trade feed
- [ ] Add route `/sportsfun/portfolio` (multi-wallet portfolio center)
  - Scope: portfolio management across saved wallets + aggregated analytics
- [ ] Add global `sports.fun` search input
  - Scope: search by token symbol/name/address/wallet across sports.fun pages
- [ ] Add `watchlist` and standalone `top gainers` market tool for sports.fun
  - Note: we have gainers on NFL/Soccer pages, but no dedicated sports.fun watchlist module

## 5) Notes about access-gated parity (tenero)
- [ ] Validate post-login tracker/portfolio parity against Tenero
  - Current blocker: Tenero auth flow exposes only `Continue with Google` (no temp-email signup flow detected)

## 6) Missing wallet analytics vs `https://tenero.io/sportsfun/wallet/[address]`
- [ ] Add dedicated wallet route `/sportsfun/wallet/[address]`
  - Scope: wallet profile header (short address, editable label, tracked/not-tracked state, explorer link)
- [ ] Add wallet overview cards parity
  - Scope: `USDC balance`, `total value`, `token holdings`, native-vs-token split
- [ ] Add wallet PnL distribution panel
  - Scope: distribution buckets by performance ranges
- [ ] Add wallet `PnL Calendar`
  - Scope: calendar/heatmap-style historical profitability view
- [ ] Add wallet `Trade Stats` module with timeframe switcher
  - Scope: `1d/7d/30d/all`, buy/sell trades, trade volume net, add/remove liquidity, avg buy/sell/swap, traded tokens/pools/platforms
- [ ] Add wallet `Funding` module
  - Scope: funded-by source and funding transaction summary
- [ ] Add wallet `Transactions sent` summary
  - Scope: first/last activity timestamps
- [ ] Add dedicated `Transfers` tab for wallet view
  - Note: current grouped activity exists, but no standalone transfer-focused view
- [ ] Extend wallet holdings table parity
  - Scope: combined columns for `Bought`, `Sold`, `Avg B/S`, `Realized PnL`, `Unrealized PnL`, `Total PnL`, `Active`

## 7) Tenero API integration TODO (`api.tenero.io`)
- [ ] Add `sportsfun` API client with typed wrappers for public wallet endpoints:
  - `GET /v1/sportsfun/wallets/{address}`
  - `GET /v1/sportsfun/wallets/{address}/trade_stats?timeframe=...`
  - `GET /v1/sportsfun/wallets/{address}/daily_trade_stats?timeframe=...`
  - `GET /v1/sportsfun/wallets/{address}/holdings`
  - `GET /v1/sportsfun/wallets/{address}/holdings_value`
  - `GET /v1/sportsfun/wallets/{address}/trades` (cursor pagination via `data.next`)
  - `GET /v1/sportsfun/wallets/{address}/transfers`
- [ ] Add `sportsfun` market data endpoints to client:
  - `GET /v1/sportsfun/tokens`
  - `GET /v1/sportsfun/pools`
  - `GET /v1/sportsfun/market/top_gainers`
  - `GET /v1/sportsfun/market/top_inflows`
  - `GET /v1/sportsfun/market/top_outflows`
  - `GET /v1/sportsfun/market/whale_trades`
  - `GET /v1/sportsfun/market/hourly_netflow`
- [ ] Implement resilience for unstable endpoints
  - Note: `GET /v1/sportsfun/wallets/{address}/pnl_distribution` can return `500` for some wallets; UI should degrade gracefully
- [ ] Handle auth-gated Tenero features behind our own auth/proxy
  - `GET /v1/sportsfun/tracked_wallets` returns `401` without auth
  - `GET /v1/sportsfun/portfolio_wallets` returns `401` without auth
  - `GET /v1/sportsfun/wallet_remarks` returns `401` without auth
- [ ] Add server-side rate-limit handling and caching
  - Observed headers: `x-ratelimit-limit: 200` and `x-ratelimit-remaining`
- [ ] Add integration fallback if CORS policy changes
  - Current observation: origin reflection is permissive for tested origins, but this should not be relied on long-term
- [ ] Run legal review before production rollout
  - Tenero ToS indicates data/content ownership restrictions (copying/redistribution/modification may require explicit permission)
- [ ] Optional: generate types from `https://api.tenero.io/api-docs/json` and pin contract tests for critical endpoints
