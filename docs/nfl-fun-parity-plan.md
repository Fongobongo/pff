# План паритета с nfl-fun.vercel.app

## Очередь работ
1) Market Overview (NFL) — расширить рынок до уровня nfl-fun
   - Market Cap (оценка по supply/metadata), Market Sentiment (bullish/bearish), Price Range/Spread.
   - Trend‑фильтры All/Gainers/Losers.
   - Position Breakdown (QB/RB/WR/TE/etc) с долей и средней динамикой.
2) Players — карточка/таблица как на nfl-fun
   - Фильтр по позиции и режимы Season Stats / Weekly Stats.
   - Колонки: FPts, FPPG, Proj, L3 Avg, Avg Rank, TP Rate, Total TP, TP/Price и др.
3) Trending — добавить L3‑метрики и тренд‑скор
   - L3 Avg FPts, L3 Avg Rank, TP Rate L3, Trend, Opp Δ.
   - Фильтры по позиции/тренду/оппонентам.
4) Advanced Stats — вкладки и метрики
   - Efficiency, Volume, Red Zone, Advanced, Tournament.
   - EPA, air yards, red‑zone usage, ceiling/floor/consistency.
5) Opportunities — недельный usage‑трек
   - Targets/Rushes/Snaps по позициям и L3‑сводки.
6) Matchups — расширить до matchup‑карточек
   - Implied points и defensive ranks vs позициям.
7) Analytics — сравнение игроков + турнирная аналитика
   - Player compare, usage trends, contest‑аналитика.
8) Signals/Alerts — отдельная страница
   - Market signals, алерты по резким изменениям.
9) Маппинг Sport.fun ↔ NFL игроки
   - Привязка tokenId к player_id/позиции для сквозных таблиц.

## Примечания
- Данные для NFL берём из nflverse (weekly/season) и Sport.fun on‑chain.
- Where metadata is missing, показываем пометки и не блокируем страницы.
