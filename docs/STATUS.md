## Current source and analysis status - 2 November 2026

The existing GitHub remote `atomicglobalservices-star/dark-markets2` is verified private. Earlier publication-blocker notes are historical. Only source, documentation, tests and public branding assets are included in source control; local credentials, data, dependencies, build output and runtime logs remain excluded.

The current application includes the shared market engine, responsive Markets and Overview, Premium widget canvas, calendar integration and deterministic technical-analysis foundation. Phase 1 analysis validation: 138 unit tests, TypeScript and production build passed. See [technical analysis usage and limitations](technical-analysis-phase1.md). This is a local evaluation build, not a public deployment or live-billing activation.

## Local MT5 experiment retired — 1 November 2026

The disconnected, zero-observation local MT5 bridge, its dedicated process, adapter, UI, scripts and tests were removed. The crypto API now calls the existing engine client directly. See WORKING-FEEDS-CLEANUP.md for retained integrations and validation.

## Reliability results — 1 November 2026

Final five-minute verification: 2160/2160 fresh observations (100.0000%) within the unchanged 60-second requirement, versus 85.6481% in the three-minute baseline. Source changes: 4 before / 4 final, with actual-window rates 1.371/0.814 per minute. Final quota events 0; final process/API failures 0/0/0. These short windows are not a 24-hour pass.

The intermediate worker crash and every maintenance restart remain recorded. Worker heartbeat, job-health handling and retries were corrected. The active clean 24-hour run is `work/reliability/acceptance-v5`; the original endurance evidence is unchanged. Tests: 79 unit cases, 25 integration scenarios, TypeScript, production build and desktop/mobile checks passed. Branding, subscriptions and test billing are preserved. See [the full measured report](RELIABILITY-RESULTS.md) and [implementation details](RELIABILITY.md).

## Markets layout cleanup — 1 November 2026

Removed the redundant Browse instrument list and Global instrument coverage panel from Markets. The section-filtered chart dropdown remains the instrument selector. Each market tab now shows its own explanatory information; SEC company fundamentals and their cache requests are scoped to Stocks only. Widget settings remain loaded independently for every section. Quote feeds, data collection, subscriptions and billing are unchanged.

Validation: TypeScript, production build and authenticated desktop/mobile browser checks across all market groups, including absence of the removed panels and stock fundamentals outside Stocks. Evidence: ignored `work/market-cleanup-*`.

## Market directory follow-up — 1 November 2026

The Markets directory now includes official attributed quote tables for the full configured global list: 13 Forex, 13 Stocks, 6 Indices, 10 Commodities, 6 ETFs and 7 broker-specific CFDs (55 total). Native crypto quotes remain separate. This is the configured catalogue, not every instrument worldwide. Category tabs and search filter the browse list, vendor quote configuration and chart selector together; changing sections cannot retain an unrelated chart. Browse buttons select the exact requested chart.

CFDs use explicitly identified OANDA symbols inside the official TradingView display, including US 500, US Nas 100, US Wall St 30, Germany 30, UK 100, gold and silver. Latest available vendor quotes were visually verified; availability, market closure and delay still depend on the vendor. No prices are extracted or injected into backend reports, alerts or exports. Admin display controls still apply. Native raw CFD API access remains unconfigured.

Validation: 65 unit tests; production build; authenticated browser checks across all six global sections, All markets, Crypto, cross-category search, exact chart selection and mobile overflow. Browser screenshots/results are in ignored `work/market-tabs-*` and `work/cfd-*`. Vendor requests cancelled by rapid tab changes appear as `ERR_ABORTED`; no page errors occurred. The backend and endurance monitor did not require a restart.

# Zero-cost expansion status — 1 November 2026

The website is running at http://localhost:3100. This section supersedes the earlier expansion snapshot below. Branding, existing accounts/subscriptions and test billing are preserved. No deployment, subscription purchase or live payment activation occurred.

- Central REST prices refresh every 60 seconds, with the existing shared crypto WebSocket. Historical API reads use a scheduled backend cache and never create subscriber-specific exchange requests. Non-crypto collection requires a known open session.
- Actual cached sources: 100 Capital Data Wire articles, 79 Finance Calendar records and SEC filings/company facts for 10 companies. Counts are a collection snapshot, not a completeness guarantee. Missing SEC concepts remain missing.
- 49 attributed TradingView chart definitions cover global markets separately from the existing 84-instrument native registry. Widgets are third-party displays; their prices are never extracted into reports or alerts. The actual feed inside a widget can differ from the requested listing.
- News, calendar and SEC collection runs hourly. SEC uses the supplied contact in the ignored local environment, serial requests, conditional retrieval and filing-change checks. Source dates, periods, units, attribution and limitations are retained.
- Admin source controls persist and are audited; collection status and daily UTC usage are visible. Capital Data Wire articles are labelled upstream AI-written and uncorroborated, and excluded from external AI evidence. Calendar unknown values and times remain unknown.

Validation: 64 unit tests, 14 existing customer-journey scenarios, 5 market integration scenarios and 6 free-data integration scenarios passed. TypeScript and production build passed. Browser checks covered desktop/mobile markets, news, calendar and admin without overflow or page errors. Evidence is in ignored `work/*zero-cost*`, `work/free-data-integration-results.txt` and `work/browser-zero-cost-results.json`.

The endurance run remains active: started 1 Nov 00:58:58 SAST, due 2 Nov 00:58:58 SAST. At roughly one hour it had 61 successful app/engine/worker samples, five quota events and recorded restarts. It is not a completed or clean 24-hour pass. Essential maintenance is retained in `work/endurance/maintenance.jsonl`; the monitor has not been reset for this expansion.

Remaining limits: native non-crypto credentials/entitlements are unconfigured; widgets depend on vendor availability and delays; calendar coverage is partial; upstream AI news is not independently verified. Commercial exchange redistribution remains unapproved. No external AI provider was activated, and no 20,000-user load claim is made. See [market-data guide](MARKET-DATA.md) for source terms and configuration.

---

## Earlier expansion snapshot (historical)

# Implementation status — 1 November 2026

DARK MARKETS is running locally at **http://localhost:3100**. The approved logo and electric-blue/chrome/black design are preserved. Existing account data, subscriptions/trials and test billing remain intact. Nothing was deployed publicly; no paid API or live payment was activated.

## Delivered in this expansion

- 84 searchable explicit definitions: 36 crypto pairs (12 assets × USD/USDT/EUR), 13 forex pairs, 13 equities, 6 ETFs, 6 cash indices, 10 commodities. Registry/connected coverage are distinguished. No underlying spot, ETF or futures price is relabelled as a CFD.
- Public exchange product discovery validates exact base/quote, currency, trading product and venue. The latest checked snapshot had 36 connected crypto observations: Binance 24, Coinbase 11 and Kraken 1, with none stale. This is a point-in-time result, not a permanent availability guarantee.
- Shared daemon, cache/deduplication, one combined Binance WebSocket, bounded SSE, per-provider budgets, failover/recovery, breakers, backoff, quota awareness, stale warnings and coverage/process telemetry. A fresh cached price can serve through a busy health probe without unnecessary venue changes.
- Authenticated 1m/5m/1h/1d historical endpoints and chart controls, loading/error states, completed source-specific OHLCV, bounded backfill, separate historical-source labels, unit/timezone/session metadata and optional explicitly entitled Twelve Data venue schedules. Gaps are not fabricated.
- Finnhub and normalized licensed-news adapters; Trading Economics and normalized licensed-calendar adapters; source/time/ID validation, URL deduplication, category/search/asset filters, country/currency filters and pending/tentative economic values. Precise event alerts skip tentative times. No real news/calendar credentials exist, so both remain clearly labelled educational fixtures.
- Deterministic report evidence adds history return, volume, volatility, advanced indicators and timestamp-aligned log-return correlations. Relevant news/calendar evidence and limitations are displayed. Optional external AI is separately gated by credentials and source AI-use permissions. Premium custom-research limits remain unchanged. No personalised advice/trading execution was added.
- Admin diagnostics show process memory/uptime, stream, cache, provider errors/quotas, fallback/recovery and coverage. Data/history/stream rights, sessions, existing entitlements and export restrictions remain enforced.
- Hidden finite 24-hour test supervisor, atomic persisted minute samples and summaries, worker heartbeat, controlled mock failure tests and restart/gap counters. Run started 1 Nov 00:58:58 SAST, due 2 Nov 00:58:58 SAST. **Still running; no 24-hour pass claimed.** Planned implementation restarts are logged and retained.
- Nodemailer 10.3.1 and targeted deepmerge-ts 8.0.2 override: npm audit reduced from five affected packages to zero known findings; Prisma version/client and database schema remain unchanged.

## Executed validation

| Check | Result |
| --- | --- |
| Unit/security/provider/content tests | 51 passed |
| Existing PostgreSQL/HTTP/SMTP customer journey | 14 scenarios passed, 15 tests including parent |
| Extended live history/HTTP/SSE/rights suite | 5 scenarios passed, 6 tests including parent |
| TypeScript / Prisma client generation / production build | Passed |
| Local mock HTTP/fan-out load | 5,000 requests, concurrency 100, 250 streaming consumers; zero failures; one upstream fixture call |
| Real public source smoke / coverage | Binance REST/WebSocket, Coinbase, Kraken connected; 36-pair snapshot recorded |
| Dependency audit | Zero known npm findings after targeted updates; not a penetration test |
| 24-hour endurance | In progress; actual elapsed time and findings are in work/endurance/summary.json |

Artifacts: `work/unit-expansion-results.txt`, `work/integration-expansion-results.txt`, `work/feed-integration-expansion-results.txt`, `work/build-expansion-results.txt`, `work/load/results.json`, `work/coverage-results.json`, `work/npm-audit-after.json`, `work/endurance/`. No raw market dataset was published.

## Remaining work and limits

Missing: Twelve Data/CoinGecko optional token, Finnhub/Trading Economics and optional AI credentials, written commercial display/non-display/AI/caching/export/redistribution permissions, exact entitled index/futures/CFD mappings and contract specifications, credentialed international venue/session validation, production provider credit/cost/retention policy, and completion of endurance monitoring. Local crypto connectivity is not proof of commercial redistribution rights. The real news/calendar adapters have mock validation but no genuine credentialed delivery test.

The load test exercises a local mock engine/HTTP/fan-out path, not the full authenticated application/database or 20,000 subscribers. Multi-host supervision, distributed leadership/fan-out, stronger connection/abuse controls, database profiling and measured full-stack capacity remain. The current endurance run includes planned maintenance and can complete with findings; it must not be called a clean uninterrupted pass.

Existing production gaps remain: subscription reconciliation/out-of-order webhooks, real invoices/tax/refund policy, enhanced operational reporting, long-job leases/report deduplication/dead-letter operations, MFA, content/legal/privacy/retention review, accessibility and independent security testing. Repository publication and external hosting were not performed or re-checked in this task.

See [market-data configuration, rights review and restart/monitor commands](MARKET-DATA.md). Production payments remain disabled.

Desktop/mobile browser checks passed for connected 5-minute charts, directory search, calendar filters and provider monitoring: no page exceptions or horizontal overflow; approved logo and blue accent confirmed.
