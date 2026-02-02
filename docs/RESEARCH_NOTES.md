# Research Notes

## Reference product: nfl-fun.vercel.app

Observed routes (from HTML crawl):

- `/nfl`
- `/nfl/players`
- `/nfl/players/:id`
- `/nfl/teams`
- `/nfl/standings`
- `/nfl/portfolio`
- `/nfl/token`
- `/nfl/trending`
- `/nfl/analytics`
- `/nfl/advanced-stats`
- `/nfl/opportunities`
- `/nfl/matchups`
- `/nfl/defensive-matchups`
- `/nfl/tournament-summary`
- `/nfl/tournament-matrix`

These represent the minimum feature surface we should match.

## Official docs (Sport.fun)

- Start page: https://docs.sport.fun/
- NFL scoring matrix: https://docs.sport.fun/nfl/scoring-system/scoring-matrix
- Football (soccer) scoring matrix: https://docs.sport.fun/football/scoring-system/scoring-matrix

### NFL scoring matrix (high level)

See `docs/STATS_NORMALIZATION.md` for the full NFL + Football scoring matrices and normalization rules.

## Free-tier data sources (selected)

### NFL

- **nflverse-data** (via nflreadr/nflreadpy): play-by-play, rosters, and stats. Repo license: CC-BY-4.0; some datasets (FTN) are CC-BY-SA 4.0. https://github.com/nflverse/nflverse-data
- **nflreadpy** docs: the majority of nflverse data is CC-BY 4.0; FTN data is CC-BY-SA 4.0. https://nflreadpy.nflverse.com/

### Football (soccer)

- **StatsBomb Open Data**: open JSON data (competitions, matches, events, lineups). Terms require attribution and use of the StatsBomb logo when publishing or sharing insights. Coverage is limited to selected leagues/seasons; see LICENSE.pdf in the repo for the full user agreement. https://github.com/statsbomb/open-data
- **football-data.org** (optional fixtures/standings): free plan is rate-limited to 10 requests/minute for registered users; unauthenticated clients are limited to 100 requests/day and only access a small subset of endpoints. https://docs.football-data.org/general/v4/policies.html

## Ingestion status (MVP)

### NFL (nflverse-data)

- Source file: `stats_player_week_{season}.csv` from the `player_stats` release.
- API endpoint: `GET /api/stats/nfl/weekly?season=YYYY&week=WW&season_type=REG&player_id=...`
- Current mapping coverage:
  - Mapped: passing/rushing/receiving yards + TDs, receptions, interceptions, special teams TDs, fumbles lost, 2pt conversions, fumble recovery TDs.
  - Bonus fields (300+ passing, 100+ rushing/receiving) are derived during scoring.

### Football (StatsBomb Open Data)

- Sources: `competitions.json`, `matches/{competition}/{season}.json`, `events/{match}.json`, `lineups/{match}.json`.
- API endpoints:
  - `GET /api/stats/football/competitions`
  - `GET /api/stats/football/matches?competition_id=...&season_id=...`
  - `GET /api/stats/football/match-stats?match_id=...&competition_id=...&season_id=...`
- Scoring endpoint:
  - `GET /api/stats/football/score-from-match?match_id=...&competition_id=...&season_id=...&competition_tier=A`
- Current mapping coverage (event-derived): goals, shots on/off target, blocked shots, assists, big chances (xG threshold heuristic), accurate passes by half, fouls, penalties won, cards, dribbles, duels/tackles (incl. last-man heuristic), recoveries, interceptions, clearances (incl. off-line heuristic), GK actions (inside/outside box), offsides, clean sheets, goals conceded, and error-to-shot/goal heuristics.
- Unmapped fields remain: assists on penalties won (ambiguous), six-second violations, and a few niche GK/defensive actions not present in open data.

## Access notes

- `pro.football.fun` itself is protected by Cloudflare and is blocked from this execution environment.
- We can still use `docs.sport.fun` for rules + terminology.

## Sport.fun on-chain discovery (Base)

### ERC-1155 contracts (observed in test wallet history)

- `0x71c8b0c5148edb0399d1edf9bf0c8c81dea16918`
- `0x2eef466e802ab2835ab81be63eebc55167d35b56`

### Custom event signatures (topic0)

Resolved via OpenChain signature DB:

- `0xb9d061782f0a4256a6d43a73bc77d6489af234b94515a1cdacaddc9b8b2196aa`
  - `PlayerBatchTransfer(address,address,uint256[],uint256[])`
  - Observed topics length: 3 (likely `from` + `to` indexed)
  - Observed emitting addresses: the ERC-1155 contracts above

- `0xdf85ea724d07d95f8a2eee7dd82e4878a451bd282e57e84f96996918b441a6c2`
  - `PlayerSharesPromoted(address,uint256[],uint256[])`
  - Observed topics length: 2 (likely `account` indexed)
  - Observed emitting addresses:
    - `0xc21c2d586f1db92eedb67a2fc348f21ed7541965`
    - `0xc98bf3fc49a8a7ad162098ad0bb62268d46dacf9`

### Notes

- The recurring presence of `PlayerSharesPromoted` alongside ERC-1155 transfers suggests a market/router contract that updates share state.
- `PlayerBatchTransfer` and `PlayerSharesPromoted` carry the same `(ids[], values[])` payload; values look like 18-decimal fixed point.
- Both observed ERC-1155 proxies currently return an empty string for `baseURI()`.
- These contracts are ERC-1967 proxies (implementation addresses via EIP-1967 slot):
  - `0x71c8...` -> `0x7f17c01f8099c0816650d6d5c43ebd403ef1ac64`
  - `0x2eef...` -> `0x1b30c1260828aeba87d7da1fd929f6e6bc25b7e0` (BaseScan-verified: `PlayerV2`)
  - `0xc21c...` -> `0x48d29efe75e7e1403184e07005170bf72e1185a5` (BaseScan-verified: `DevelopmentPlayersV2`)
  - `0xc98b...` -> `0x216491d59b200873829084b7b16419445e8464f1`
- Next: decode tx call data (function selectors) + correlate with USDC deltas to infer buy/sell semantics and price per share.
