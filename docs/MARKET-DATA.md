## Reliability settings — current

The reliability work supersedes the older 60-second quote setting below: `MARKET_POLL_MS=15000`, with bounded jitter and collection duration additional to the timer delay; `MARKET_STALE_MS=60000` remains unchanged. Defaults: `MARKET_MIN_DWELL_MS=300000`, `MARKET_RECOVERY_PROBE_MS=30000`, `MARKET_RECOVERY_SUCCESSES=3`. Healthy fallback sources remain stable; invalid/stale/disabled sources bypass dwell. Background history reserves 40% of each provider's HTTP request allowance for live work. Read [the reliability report](RELIABILITY.md) for measured windows, timestamp-basis limitations, worker recovery and the independent acceptance run. No commercial rights or payment settings changed.

## Directory and section-scoped charts follow-up

The global embedded catalogue now contains 55 instruments (13 Forex, 13 Stocks, 6 Indices, 10 Commodities, 6 ETFs, 7 OANDA CFDs). Section/search filtering is shared by the directory, official market-quotes widget and chart selector. Crypto uses its existing native chart. Latest available CFD prices are displayed only within the attributed vendor widget; no raw CFD feed or redistribution rights were activated. Markets may be closed or delayed.

Implementation follows the [official TradingView market-quotes embed](https://www.tradingview.com/widget-docs/widgets/watchlists/market-quotes/demos/indices/). Source-specific CFD symbols are retained, and commodity continuous futures remain distinct from cash/spot and CFDs. The main quote table no longer substitutes the limited non-crypto fixtures for the global display. Native unconnected definitions remain listed separately as coverage information. No billing or branding settings changed.

# Zero-cost sources and central collection — current configuration

Updated 1 November 2026. This section supersedes conflicting settings in the earlier native-engine reference below. Local application: http://localhost:3100. Data, dependencies and runtime artifacts remain on D: wherever configured. No new runtime dependency was required for this expansion.

| Source | Current use | Cost and permission boundary |
| --- | --- | --- |
| Binance / Coinbase Exchange / Kraken | Existing shared public crypto engine; exact base/quote and venue preserved | No paid plan activated. Public endpoints do not grant commercial redistribution or AI permissions; existing commercial gates remain. |
| CoinGecko / Twelve Data | Existing fallback adapters; Twelve Data key absent | Plan, exchange and redistribution rights still required for commercial activation. |
| TradingView | 49 official attributed embedded charts | No raw data API licence implied. Vendor attribution remains. Feed, venue, delay and regional availability are determined inside the widget; requested NASDAQ listings may display Cboe One data. No scraping, interception or quote extraction. |
| Capital Data Wire | Hourly text metadata/news cache, currently 100 articles | Published distribution terms allow free text republication including commercial use. Credit and source links retained; images are not copied. Articles are upstream AI-written, uncorroborated, and excluded from external AI evidence. |
| Finance Calendar | Hourly economic/central-bank calendar, currently 79 records; optional venue sessions | Keyless allowance documented as 2,000 calls/day/IP. Commercial caching/storage/redistribution requires visible attribution and preservation of per-record licences/credits. Source verification dates can be older than collection dates. |
| SEC EDGAR | Submissions and company facts for AAPL, NVDA, MSFT, AMZN, GOOGL, META, TSLA, JPM, V, WMT | No key or paid plan. Identified User-Agent required, stored privately in `.env`. Collector uses at most one request/second. Filing links and public facts are used; this is not blanket permission to republish all filing attachments. |

Primary references reviewed: [Finance Calendar API](https://www.financecalendar.com/api/), [reference](https://www.financecalendar.com/api/reference/), [Capital Data Wire distribution](https://capitaldatawire.com/distribution), [copyright](https://capitaldatawire.com/copyright), [terms](https://capitaldatawire.com/terms), [SEC APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), [SEC developer policy](https://www.sec.gov/about/developer-resources), [official TradingView integration](https://www.tradingview.com/widget-docs/tutorials/iframe/build-page/widget-integration/). Recheck applicable terms before any paid/public launch. Zero API subscription cost is the target; hosting, bandwidth and operational costs are separate.

## Scheduling, cache and provenance

Set `MARKET_POLL_MS=60000`. Shared REST collection and Binance streaming do not scale upstream connections with visitor count. History is scheduled centrally, single-flight, bounded and checkpointed under ignored `work/central`; API reads return cached results or a warming/unavailable response. Quotes are not silently averaged or currency-converted. Provider-specific failures retain attribution and stale warnings; breakers, backoff, budgets and preferred-provider recovery remain active.

News, calendar and fundamentals jobs run hourly even without visitors. Closed/unknown non-crypto sessions skip price/history refresh; crypto remains 24/7. Missing optional venue-session data fails closed. Request counters are local process measurements, not vendor billing statements; daily usage is UTC. Admin source toggles persist in the existing database and write an audit record. No database schema migration or account reset was needed.

Select `NEWS_PROVIDER=capitaldatawire`, `CALENDAR_PROVIDER=financecalendar`. These reviewed free adapters do not require invented API keys. Other adapters retain their credential/rights gates. Set `SEC_ENABLED=true` and a real `SEC_USER_AGENT` contact locally; never commit the contact. SEC checks submissions hourly, fetches company facts when financial filings change or a seven-day revalidation is due, and supports conditional responses. It preserves CIK, concept, unit, fiscal year/period, actual start/end dates, accession and source URL. Quarterly, annual, instant and other reported-duration/YTD observations are distinguished. True zero and negative values survive; absent concepts remain empty.

Finance Calendar retains nullable actual/prior/consensus, unknown time/importance, tentative windows and original source rights/licences. Tentative times are excluded from precise event alerts. UI filters cover country, currency, date and importance. Capital Data Wire retains article URL, publication time, category, attribution and AI warning. Reports read cached evidence only; uncorroborated AI articles and all embedded widget prices are excluded from external AI input. Existing external-AI permission gates remain in force.

## Verification and remaining configuration

`npm test` passes 64 tests, including malformed payloads, outages/backoff, rate limits, symbols/currencies, cached scheduling, session gating, unknown calendar values, SEC fiscal periods and widget instrument types. `npm run test:integration` passes 14 scenarios; `npm run test:feeds:integration` passes 5; `npm run test:free:integration` passes 6. TypeScript and production build pass. Authenticated browser checks cover desktop/mobile and the official chart, without extracting its data. Counts and source evidence are recorded in ignored `work/free-source-evidence.json`.

No native non-crypto key, paid feed entitlement or external AI credentials were added. Widget availability/delay varies and is not a live-feed guarantee. Calendar coverage is partial; news remains unverified upstream AI text. Missing SEC liabilities concepts for some issuers are not synthesized. This is not a 20,000-user capacity test. The existing 24-hour endurance monitor remains running, with maintenance/restarts recorded and no completion claim; inspect `work/endurance/summary.json` and `maintenance.jsonl`.

---

## Earlier native-engine reference

# DARK MARKETS market data and reliability

Updated 1 November 2026. The existing application remains at **http://localhost:3100**. Approved blue/chrome/black branding, account data, authentication, trials and subscriptions are preserved. Billing remains test-only. No public deployment, paid account, API subscription purchase or commercial-rights activation occurred.

## Current coverage

The searchable registry has **84 explicit definitions**: 36 crypto spot pairs, 13 forex pairs, 13 equities, 6 ETFs, 6 cash indices and 10 commodities. Definitions do not imply a connected quote. `GET /api/markets/instruments?q=&category=&currency=` searches names, IDs, venues and quotation currencies without fabricating prices. The markets screen lists unconnected instruments separately.

| Coverage | Instruments | Current activation / limitation |
| --- | --- | --- |
| Crypto | BTC, ETH, SOL, XRP, BNB, ADA, DOGE, LTC, TRX, AVAX, LINK, DOT; each in USD, USDT and EUR | 36 connected observations verified locally. Exact available venue products are checked against exchange discovery; preferred venue varies by pair. No USD/USDT/EUR conversion or averaging. |
| Forex | EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, USD/CAD, NZD/USD; EUR/GBP, EUR/JPY, GBP/JPY, USD/ZAR, USD/MXN, USD/TRY | Twelve Data adapter/mappings present; missing key and appropriate business/data permissions. Bid/ask remain unavailable if not returned by source. |
| US equities | AAPL, NVDA, MSFT, AMZN, GOOGL, META, TSLA, JPM, V, WMT | Venue-bound Twelve Data mappings; no key configured. |
| International equities | Vodafone/LSE (GBX), Toyota/TSE (JPY), SAP/XETR (EUR) | Symbol and exchange supplied separately and response identity/currency checked. Venue product availability still needs credentialed validation. GBX is not silently changed to GBP. |
| ETFs | SPY, QQQ, DIA, IWM, VTI, GLD | Each remains an ETF; GLD is a proxy instrument, not spot gold. Missing Twelve Data credentials/entitlements. |
| Cash indices | SPX, NDX, DJI, FTSE, DAX, N225 | Searchable cash-index definitions in index points. No guessed provider symbols or substitute ETF/futures prices. Exact entitled vendor mappings remain required. |
| Commodities | Gold, silver, platinum, palladium, WTI, Brent, natural gas, corn, wheat, soybeans | Metal spot mappings require Twelve Data validation. Futures remain unquoted until provider, contract/delivery month and pricing units are confirmed. Metals use USD/troy ounce; oil USD/barrel; gas USD/MMBtu; agricultural contract units remain explicitly unresolved. |
| CFDs | None configured | Only a broker-specific authorised contract may be added. Underlying spot/index/futures quotes are never relabelled CFD. |

Source/availability snapshots are saved locally in ignored `work/coverage-results.json`; quote availability changes over time. Anonymous visitors receive demo fixtures. Existing entitled accounts receive connected data. Unavailable categories keep their labelled fixtures or have no quote; no synthetic history is attached to a live price.

## Provider and credential matrix

| Adapter | Credentials | Current status | Configuration / commercial dependency |
| --- | --- | --- | --- |
| Binance Spot | None for implemented public endpoints | REST and combined WebSocket verified | REST `data-api.binance.vision`, stream `data-stream.binance.vision`; exact product discovery, ticker and OHLCV. Public access is not commercial permission. |
| Coinbase Exchange | None for public market data | REST discovery, quotes/stats/candles verified | Exact product IDs, e.g. BTC-USD. Written permission needed for third-party display/derived-work distribution and restricted AI use. |
| Kraken | None for public market data | REST discovery, ticker/OHLCV verified | Exact aliases validated against pair metadata, including XDGUSD for DOGE/USD. Its ticker timestamp is explicitly local receipt time; unavailable comparable 24h percentage remains null. |
| CoinGecko | Optional `COINGECKO_API_KEY` for Demo API | Adapter present; no key. Remains fallback, with restrictive default request budget | Disclosed vendor aggregate, conservatively delayed. No invented OHLCV; commercial plan/attribution/distribution permission required. Pro API host/key mode is not silently inferred from a Demo key. |
| Twelve Data | `TWELVE_DATA_API_KEY` | Missing; disabled | Quote/time-series mappings and venue/currency validation present. Use a business plan with necessary exchange display/non-display and redistribution entitlements; delayed status retained unless separately validated. |
| Finnhub news | `NEWS_API_KEY` | Missing; disabled | Set `NEWS_PROVIDER=finnhub`, `NEWS_CATEGORIES=general,crypto,forex`, `NEWS_COMMERCIAL_RIGHTS=true`, and `NEWS_RIGHTS_REFERENCE` only after written permission. `NEWS_API_URL` is unnecessary for this named adapter. |
| Trading Economics calendar | `CALENDAR_API_KEY` in provider-supported credential format | Missing; disabled | Set `CALENDAR_PROVIDER=tradingeconomics`, `CALENDAR_COMMERCIAL_RIGHTS=true`, `CALENDAR_RIGHTS_REFERENCE` after approval. Named endpoint does not need `CALENDAR_API_URL`. |
| Generic licensed content | `NEWS_API_URL`/`CALENDAR_API_URL`, corresponding API keys | Available, not configured | HTTPS normalized JSON contract; source URLs/timestamps/IDs validated, with the same rights/reference gates. Enables authorised commodity-news coverage where the selected provider supplies it. |
| Optional AI interpretation | `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` | Missing; deterministic reporting remains active | External processing also needs each market provider's explicit `ai` permission. News/calendar processing requires `NEWS_AI_RIGHTS`/`CALENDAR_AI_RIGHTS`. No source is silently sent to an AI service without those gates. |

No credentials were printed, invented or acquired. Commercial plan names/fees must be confirmed against the intended contract and exchange rights; no price or licence purchase was assumed.

## Configuration and cost control

Ignored `.env` currently uses `MARKET_PROVIDER=multi`, `MARKET_DATA_SCOPE=local`, `MARKET_POLL_MS=30000`, `MARKET_STALE_MS=60000`, `MARKET_REQUESTS_PER_MINUTE=120` and `BINANCE_WEBSOCKET_ENABLED=true`. The 120 limit is an application request cap, not a representation of any vendor entitlement.

- `MARKET_PROVIDER_PRIORITY=binance,coinbase,kraken,coingecko,twelvedata` chooses the first available **same instrument/currency** source. Equivalent fallbacks are attributed; no price blend is calculated.
- `MARKET_PROVIDER_BUDGETS` can set independent request/minute caps. Defaults are 5 for CoinGecko and 8 for Twelve Data, otherwise the global cap. These conservative software defaults do not establish account quotas; set them below actual plan/shared-IP limits.
- `MARKET_INSTRUMENTS` can restrict the fixed canonical allowlist, e.g. `BTC/USD,BTC/USDT`. A subscriber cannot open arbitrary upstream products or URLs.
- `MARKET_ENGINE_PORT=3110` and a random 32+ character `MARKET_ENGINE_TOKEN` secure the shared loopback service. Token/keys remain server-side. Do not expose port 3110 externally.
- `MARKET_DATA_SCOPE=local` requires a loopback APP_URL and permits local evaluation display/cache/stream only. Commercial scope fails closed without provider `display`, `cache`, `redistribution`, evidence `reference`, and ISO `verifiedAt`; `stream`, `export`, and `ai` are separate permissions. These are operator attestations, not automatic contract verification.
- Demo mode makes the web/worker use fixtures; **stop the separate engine** when switching back to avoid unnecessary upstream traffic.
- Quota responses, Retry-After dates/seconds, remaining headers, HTTP 429/418 and provider-body quota errors trigger cooldown/failover. Binance used weight, cache hits, request counts and quota events are exposed to administrators. Request caps do not calculate venue weights, vendor credits, monthly invoices or other clients sharing the IP.
- With 36 pairs, polling and per-minute candle hydration generate shared provider requests per active instrument, not per subscriber. Historical timeframe requests are cached/deduplicated in the backend; user requests have an additional 60/minute application limit. Monitor measured usage in `/admin` rather than projecting per-user upstream traffic.
- Finnhub ingestion defaults to three category calls every five minutes (about 864/day before retries/cache effects); calendar ingestion is one call every five minutes (about 288/day). Both are disabled without credentials and documented rights. No third-party load test was performed.
- Optional `TWELVE_DATA_SCHEDULE_ENABLED=true` uses the official exchange_schedule adapter only when a key/venue exists. It is **off** by default: documentation lists 100 credits/request and Enterprise business availability. Date-specific venue schedules, MICs, local zones and separate market segments are retained; schedules are cached for an hour. Do not enable without checking plan/credit permission. No holiday schedule is invented if access is absent.

The generic legacy `MARKET_PROVIDER=licensed` adapter remains available. Secrets, logs, caches, browser artifacts, source/dependencies and database data remain on D:. No schema migration or data reset was required.

## Live/historical integrity and reporting

Each observation includes exact pair, provider symbol, venue/source, base/quote currency, timestamp/provenance, receipt time, latency, status and transport. Unit/kind/bid/ask are included where known. Exchange discovery validates actual base/quote and supported trading products; temporary missing products do not disable unrelated symbols.

Completed OHLCV candles support **1m, 5m, 1h and 1d**. The UI shows loading/unavailable states, source, interval and timezone; gaps are not filled. Initial backfill is bounded to the most recent 300 returned candles per request, cached in memory, not unlimited history or persistent unlicensed datasets. Provider fallback is allowed only for the same canonical pair and the historical source is independently shown if it differs from the current quote. Crypto is 24/7; equities use provider-reported session/timezone and optional entitled schedules. Forex is not falsely declared open using an invented calendar.

Indicators and reports calculate SMA, RSI, MACD/Bollinger metrics, sample return, volatility, volume and timestamp-aligned log-return correlations deterministically. Missing values stay null. Correlations are not causal claims. Evidence includes market sources/time/status, relevant genuine news and economic releases, and limitations. Unconfigured content remains explicitly educational fixtures. Optional external AI receives permitted validated observations/calculations, with existing numeric/prohibited-advice validation retained. Custom Premium research and existing transparent usage limits are preserved.

Finnhub adaptation keeps original publisher, HTTPS article URL and publication time; URL tracking variants are deduplicated. Search/category/symbol filtering is supported. A breaking flag is preserved only when genuinely supplied; Finnhub articles are not automatically called breaking. The calendar keeps source, UTC date/time, country/currency, previous/forecast/actual and units. Missing actuals remain pending; tentative times are labelled and cannot trigger a precise upcoming-event alert. Source snapshots are bound to the configured provider so switching configurations does not silently display an old provider's feed. Licensed content exports require separate `NEWS_EXPORT_RIGHTS`/`CALENDAR_EXPORT_RIGHTS`; otherwise report/account exports omit or refuse restricted content. Contract-specific historical retention/deletion policies still need owner/vendor review before content activation.

## Reliability, monitoring and restart

One backend daemon serves cached snapshots and bounded SSE fan-out to all app/worker consumers. One combined Binance socket handles its configured products. Bad identities/payloads, disconnects, inactivity, and planned pre-24h rotation trigger jittered exponential reconnect. Circuit breakers track failures/cooldown/probes; valid fresh quotes, not ping alone, recover a preferred provider. A busy health probe no longer creates a gratuitous venue switch when a still-fresh cached price exists.

`/admin` shows memory, uptime, stream state, cache hits, coverage, fallback/recovery and per-provider errors/quotas. `GET /api/markets/health` additionally requires admin authorisation. Live snapshots/history/SSE require existing subscription access; anonymous users retain demo. SSE reconnects recheck access after a maximum 55-second stream. Internal consumer count is capped at 1,000, with slow-client backpressure protection. No 20,000-user capacity claim is made.

```powershell
Set-Location D:\DARK-MARKETS
.\scripts\start-market-engine.ps1          # hidden loopback engine, idempotent
.\scripts\start-market-engine.ps1 -Restart # after provider/config changes
# Separate foreground terminals if needed:
npm run dev -- --hostname 127.0.0.1 --port 3100
npm run worker
```

The existing ignored `work/start-local.ps1` starts Docker DB/mail, web/worker and engine. All services are already running. Logs: `work/logs`. Restart the worker after source/environment changes. A multi-host commercial architecture still needs supervision, authenticated service networking, distributed leadership/broadcast, stronger connection/rate controls and database/load profiling.

## Finite 24-hour test — running, not passed

The locally supervised endurance run started **1 November 2026 at 00:58:58 SAST** and targets **2 November 2026 at 00:58:58 SAST**. It has not completed 24 hours. The detached supervisor survives closing its terminal, restarts a crashed runner at most three times, resumes saved state and stops at the deadline. It does not promise survival across an OS reboot without relaunch.

```powershell
.\scripts\start-endurance.ps1
Get-Content .\work\endurance\summary.json
```

Evidence is persisted under ignored `work/endurance`: atomic state/summary JSON, minute samples, controlled-failure test output, runner logs and `maintenance.jsonl`. Worker heartbeat is in `work/monitor/worker.json`. Samples measure engine/app availability, source/circuit counters, quote updates/freshness, connection/reconnection counts, fallback/recovery, quota events, cache use, process IDs/restarts, memory and CPU. Monitoring gaps are recorded; elapsed wall time alone does not count as adequate monitoring coverage. Freshness is measured among returned observations; the separate coverage diagnostics must also be checked for missing instruments. CPU values refer to engine process CPU; the local load-test process is measured independently, not whole-machine capacity.

Early observations included rate-limit events, stale quotes and unnecessary source switching before mapping/cache fixes. Planned engine/worker/monitor restarts during implementation are explicitly retained in maintenance logs and restart counters. They are not concealed to obtain a pass. The controlled outage/malformed-response/disconnection tests run against mocks, not injected into unrelated live users. The run can complete with findings; a pass requires 24 actual hours, adequate sample coverage, freshness/uptime thresholds and no tracked engine/worker restarts. This development run contains planned restarts, so it must not be presented as a clean uninterrupted 24-hour pass.

## Validation and security

- 51 unit/security/provider/content tests passed, including expanded identities/units, timeframe candles, discovery, calendar validation, source validation, deterministic evidence, rate limits, failure/recovery and reconnects.
- Existing customer journey: 14 scenarios passed (15 Node tests including parent), preserving verification/reset email, subscriptions/expiry, tenant isolation, research limits and billing-test behavior.
- Extended live HTTP/SSE suite: 5 scenarios passed (6 tests including parent), including authenticated 1m/5m/1d history, currency/source identity, catalog, admin restrictions, shared streaming and export permissions.
- TypeScript, Prisma JS client generation and production build passed.
- Bounded **local mock-only** load test: 5,000 HTTP requests at 100 concurrent clients plus 250 SSE consumers; zero failures, one upstream fixture call. Recorded p95 about 45 ms, p99 about 96 ms on this machine. `work/load/results.json` has exact values. This excludes full application/auth/database and third-party capacity; it is not evidence for 20,000 simultaneous subscribers.
- Nodemailer updated to 10.3.1; targeted `deepmerge-ts` override 8.0.2 removes the advisory chain through Prisma tooling without a Prisma major migration. Client generation/build/typecheck and local SMTP customer regressions passed. npm audit reports **zero known vulnerabilities** in `work/npm-audit-after.json`; that is not an independent security audit.

```powershell
npm test
npm run typecheck
npm run build
npm run test:integration
npm run test:feeds:integration
npm run test:load
```

## Commercial terms review and remaining configuration

No reviewed public-access document established permission for this subscription website to redistribute every provider's data. Commercial scope remains disabled and no contract was accepted on the owner's behalf.

- [Coinbase Market Data Terms](https://www.coinbase.com/legal/market_data) restrict external distribution/display/derived works without written consent, and separately restrict AI-related use. Obtain explicit written permission before an external service or AI processing; public endpoints alone do not satisfy it.
- [Finnhub terms](https://finnhub.io/terms-of-service) require written redistribution approval and distinguish personal use from business use. Do not use a personal plan for this business merely because a token works.
- [Twelve Data business plans](https://twelvedata.com/pricing-business) address commercial/external use; venue entitlements and the exact data product still need confirmation. [Schedule documentation](https://twelvedata.com/docs#exchange-schedule) identifies its separate credit/plan requirements.
- [Binance Vision dataset terms](https://github.com/binance/binance-public-data/blob/master/TERMS_AND_CONDITIONS.md) limit that dataset's commercial use. That document is dataset-specific, not proof that REST/WebSocket use grants a commercial licence; separately review the applicable API/market-data agreement.
- [Kraken regional terms](https://www.kraken.com/legal) require the applicable regional agreement; no broad paid redistribution permission was established by this review.
- [CoinGecko API plans](https://www.coingecko.com/en/api/pricing) and contract must be checked for attribution, display, caching and redistribution; the adapter's current Demo API mode is not an enterprise grant.
- [Trading Economics calendar documentation](https://docs.tradingeconomics.com/economic_calendar/snapshot/) specifies the API fields, not a licence to redistribute them. Obtain credentials and the required display/distribution contract before activation.

Remaining external dependencies are genuine keys and written rights for non-public feeds/content/AI, exact index and futures/CFD contract mappings, credentialed venue/session validation, cost/credit/retention policy, completion of the current endurance run and a later clean stability/load/security review. News/calendar adapters are implemented and mocked, but **genuine news/calendar delivery is not active**. No AI provider was activated or finance/trading instructions generated.

Desktop/mobile browser checks passed for connected 5-minute charts, directory search, calendar filters and provider monitoring: no page exceptions or horizontal overflow; approved logo and blue accent confirmed.
