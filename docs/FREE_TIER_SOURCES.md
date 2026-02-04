# Free-Tier Data Sources & Constraints

This project relies only on free-tier data sources. The constraints below are intentionally high-level to avoid stale numbers; always verify provider limits before heavy usage.

## Player stats

- **StatsBomb Open Data (football)**  
  Source: `statsbomb/open-data` on GitHub (raw JSON).  
  Constraints: public dataset, no API key. Subject to GitHub bandwidth/rate limits. We cache responses to reduce repeated downloads.

- **NFLverse (NFL weekly stats)**  
  Source: GitHub releases in `nflverse/nflverse-data` (CSV assets).  
  Constraints: public dataset, no API key. Subject to GitHub API/asset rate limits. We cache the CSV content and re-use it across requests.

- **football-data.org (fixtures/standings)**  
  Source: public API with free tier.  
  Constraints: requires an API key, strict rate limits on free tier. We keep requests cached and avoid unnecessary re-fetches.

## Blockchain data

- **Base public RPC**  
  Source: `https://mainnet.base.org` by default.  
  Constraints: public RPCs can rate-limit or throttle bursty traffic. Keep calls small and cache wherever possible.

- **Alchemy (optional)**  
  Used for wallet history when `ALCHEMY_API_KEY` is set.  
  Constraints: free tier rate limits; use batching/caching.

- **Etherscan/Basescan (optional)**  
  If `ETHERSCAN_API_KEY` is set, the free tier is still limited. Use sparingly and cache results.

## Caching notes

- The stats caching layer uses in-memory cache plus optional disk-backed cache (see `STATS_CACHE_DIR`).
- Most stat providers already apply Next.js `revalidate` caching on top of local caching.
