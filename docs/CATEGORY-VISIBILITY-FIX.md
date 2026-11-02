# Category visibility fix — 1 November 2026

The directory conflated native quote availability with instrument membership. `Terminal` filtered returned native quotes, excluded non-crypto categories represented by TradingView, and skipped rendering `MarketTable` when there were no native rows but visual definitions existed. TradingView then independently omitted restricted symbols from its quote widget. As a result, valid registry instruments remained in All Markets discovery/chart options but disappeared from individual category directory tables. The category strings themselves were correct.

`lib/market-directory.ts` now builds rows from the shared configured visual registry, joins optional native quotes by exact instrument ID, and applies category/search filtering afterward. Missing, demo, delayed, stale or restricted data does not decide membership. `app/market-directory.tsx` uses the existing table styling and displays honest price/status cells plus native, visual-only or exact external chart actions. `app/terminal.tsx` renders this directory unconditionally on Markets and uses the same registry selector for chart options. Existing TradingView quote/chart components are unchanged. Dashboard/watchlist quote tables retain their existing paths.

Measured main-directory row counts in an authenticated browser:

| Category | Before | After |
|---|---:|---:|
| All markets | 8 native rows | 40 registry rows |
| Crypto | 8 | 8 |
| Forex | 0 | 8 |
| Stocks | 0 | 6 |
| Indices | 0 | 6 |
| Commodities | 0 | 6 |
| ETFs | 0 | 4 |
| CFDs | 0 | 2 |

All Markets already had 40 configured chart options; all 40 identities remain. These are directory counts, not newly connected quote counts. The independently functioning TradingView quote widget still has 30 eligible core rows; its vendor restrictions were not bypassed.

Commodities now lists Gold, Silver, WTI, Brent, Natural Gas and Copper as continuous futures, with unavailable native prices and exact external chart actions. Indices lists S&P 500, Nasdaq 100, Dow, FTSE 100, DAX and Nikkei as cash indices. The four restricted indices retain external chart links; DAX/Nikkei retain their working visual chart actions. Related calculated references and CFDs remain separately labelled in the existing optional alternative views; none is substituted into a cash-index or futures row.

Validation: 91 unit tests passed, including new missing-price/restricted-symbol membership regressions. Authenticated browser tests compare every category's exact IDs with the corresponding All Markets subset, verify all 40 chart actions, open native and DAX visual charts, exercise name/ID search and confirm six rows in both target categories on mobile. Desktop/mobile had no page errors or page overflow; horizontal table scrolling keeps chart actions reachable on narrow screens. TypeScript checking and production build passed. Evidence is in `work/category-fix/` (`before.json`, `after.json`, screenshots and test logs).

No feed integration, provider mapping, branding, billing, deployment or service purchase changed. The crypto acceptance monitor remains running with the same engine instance and zero engine/worker restarts or application errors at the final check.

Local URL: http://localhost:3100/markets
