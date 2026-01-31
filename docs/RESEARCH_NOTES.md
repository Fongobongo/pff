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

(We should ingest all of these stat fields from our web sources)

- Passing TD: +4
- Passing yard: +0.04 (25 yards = 1 point)
- 300+ passing yards bonus: +3
- Interception: -1
- Rushing TD: +6
- Rushing yard: +0.1 (10 yards = 1 point)
- 100+ rushing yards bonus: +3
- Receiving TD: +6
- Reception: +1
- Receiving yard: +0.1
- 100+ receiving yards bonus: +3
- Return TD (punt/kickoff/FG): +6
- Fumble lost: -1
- 2pt conversion (pass/run/catch): +2
- Offensive fumble recovery TD: +6

## Access notes

- `pro.football.fun` itself is protected by Cloudflare and is blocked from this execution environment.
- We can still use `docs.sport.fun` for rules + terminology.
