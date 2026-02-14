# pff

Fan site built with **React / Next.js** for the game **pro.football.fun**.

## Goals

- Analyze a player's portfolio history by **wallet address** on **Base** (Ethereum L2).
- Display up-to-date player statistics sourced from the web (covering all metrics used by the game to calculate points).

## Project policies

- English only across docs, code, and comments.
- Keep a conversation log and a changelog in the repository:
  - `docs/CONVERSATION_LOG.md`
  - `CHANGELOG.md`
- Free-tier data sources and limits:
  - `docs/FREE_TIER_SOURCES.md`
- Sport.fun soccer name refresh runbook:
  - `docs/SPORTFUN_SOCCER_NAMES_RUNBOOK.md`
- Sport.fun TP sync from in-game API (`app.sport.fun`):
  - `npm run sportfun:tp-sync-game`
  - API: `GET/POST /api/sportfun/tp/sync-game`
