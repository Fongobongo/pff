# Sport.fun Price Sync (Supabase)

## Goal
- Remove heavy on-chain `getPrices` fanout from page requests.
- Keep athlete/token prices in Supabase and read valuations from Supabase-backed rows.

## Data flow
1. Background refresh fetches external prices:
   - GeckoTerminal: `GET /api/v2/simple/networks/base/token_price/{addresses}`
   - DexScreener: `GET /tokens/v1/base/{addresses}`
2. Prices are upserted into `public.sportfun_token_prices` (`token_id = "__contract__"` for contract-level rows).
3. For athlete token IDs (`ERC-1155`), when a page scan has decoded trades with price/share:
   - latest observed trade price is upserted as `sportfun_trade_hint` / `sportfun_market_last_trade`.
4. Portfolio/market routes read `sportfun_token_prices` (no `FDFPair.getPrices` RPC calls).

## Table bootstrap
- Run SQL once: `docs/supabase_sportfun_prices.sql`

## Runtime config
- `SUPABASE_PROJECT_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`)
- `SPORTFUN_PRICE_SYNC_ENABLED=1`
- `SPORTFUN_PRICE_REFRESH_MINUTES=10`
- `SPORTFUN_EXTERNAL_PRICE_TOKENS=` (optional comma-separated extra token addresses)

## Refresh trigger
- Automatic throttled trigger from requests (`~10m` default).
- Manual/cron endpoint:
  - `GET /api/sportfun/prices/refresh`
  - `POST /api/sportfun/prices/refresh`
