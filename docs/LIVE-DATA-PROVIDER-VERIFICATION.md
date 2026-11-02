# Live market API verification — 1 November 2026

**Result:** Both public services responded with real data. Two isolated adapters and central, local-only evaluation caching are implemented. Neither provider is enabled for paying subscribers. The original 40-instrument catalogue, category fix, crypto engine, TradingView, branding, subscriptions and billing settings remain unchanged. No deployment, migration, purchase or new daemon was performed.

Evidence: `work/provider-verification/` contains HTTP status/headers/bodies, source and receipt times, latency, catalogues, normalised observations, history validation, SignalR results, integration failures/recovery and test logs. Main REST probes ran around **14:31–14:34 SAST** (12:31–12:34 UTC). These are bounded samples, not provider endurance/SLA certification.

## 1. Verified endpoints and results

| Provider / endpoint | Actual result | Classification |
|---|---|---|
| Biquote `/api/symbols` | HTTP 200; **2,079** records across six source labels | Catalogue verified; not proof every instrument quotes |
| Biquote `/api/symbols?quotedWithinDays=7` | HTTP 200; **718** records | Recent-coverage directory; includes closed-market records |
| Biquote `/api/active` and `/health` | HTTP 200; 403 active records at sample, health reported healthy | Transport/service working; does not establish quote freshness |
| Biquote `/api/{symbol}` | Eight FX pairs and several broker products returned 200, closed/stale | Technically working, closed previous-session indicative observations |
| Biquote `/api/latest?symbols=EURUSD&symbols=USDJPY&symbols=XAUUSD` | HTTP 200, keyed object with exact requested symbols | Batch verified; repeated parameters, not comma-separated IDs |
| Biquote `/api/EURUSD/ohlc?interval=1h&limit=30` | HTTP 200; 31 bars including one marked open; **30 closed bars** validated | History structure works; per-bar source is unverified |
| Biquote `/api/news/market?maxResults=3` | HTTP 200; three attributed, timestamped aggregated stories | Technical response verified; reuse/corroboration incomplete |
| Biquote `/api/calendar/upcoming?limit=3&importance=high` | HTTP 200; three events with IDs, agency links, nullable actual values | Technical response verified; not blanket verification of event values |
| Biquote `/hubs/tick` through SignalR negotiation | HTTP 200; WebSocket, handshake and Subscribe acknowledged; one EURUSD payload received | Streaming transport works; received tick was Friday's old quote |
| Gold API `/symbols` | HTTP 200; **XAU, XAG, XPT, XPD, HG, BTC, ETH** | Actual seven-asset catalogue verified |
| Gold API `/price/{symbol}/USD` | HTTP 200 for all five requested metals | Four precious-metal spot references normalised; copper unit unresolved |
| Gold API `/history` and `/ohlc/XAU` without key | HTTP **401** | Authenticated history unavailable; no key configured |

Negative checks: unknown symbols returned 404; unsupported `NATGAS` returned 404 while the catalogued `XNGUSD` returned 200; invalid calendar/history parameters returned 400. The two main probe logs record **57 REST responses: 43 × 200, 2 × 400, 2 × 401, 10 × 404**. Additional batch/collection/stream checks are retained separately. No unexpected 5xx or actual quota exhaustion occurred in those samples. We did not deliberately exhaust a free service; 429, 503, Retry-After, malformed JSON and outage behaviour were tested with controlled fixtures.

Sources: [Biquote API documentation](https://biquote.io/docs/), [Gold API documentation](https://gold-api.com/docs), [Gold API timestamp/unit FAQ](https://gold-api.com/faqs). All paths above were exercised; advertised but untested endpoints are not counted as working integrations.

## 2. Freshness, identity and unit findings

Biquote's eight FX observations were dated **30 October ~20:58 UTC**, around **39.5 hours old**, and explicitly `marketState=closed`, `stale=true`. For example EURUSD was bid **1.11597**, ask **1.11611**, indicative midpoint **1.11604** at `2026-10-30T20:58:50Z`. These are last-session broker references, not live last trades. The SignalR probe also delivered this old timestamp: a connected socket is not proof of live market activity. Closed-market change figures are not imported into subscriber analytics.

Sources are labelled `MetaTrader 5 (Broker 1)`, `MT5-2`, `aggr`, `hakandoviz`, `haremaltin` or `MATRIKS`. The catalogue and responses do not establish the legal identity/permissions of Broker 1 or the exact trading venue/contract behind every aggregated product. USDCHF, USDCAD and USDZAR catalogue currency fields were USD, inconsistent with their symbol-derived CHF/CAD/ZAR countercurrencies. Evaluation records retain an explicit warning; these discrepancies are not silently treated as verified provider metadata. Stock records claimed NYSE while their tick responses could have a null exchange. No listed-equity mapping is approved from those fields.

Gold API samples:

| Symbol | Actual price, USD | Provider `updatedAt` UTC | Receipt age | Unit/result |
|---|---:|---|---:|---|
| XAU | 3876.399902 | 2026-11-01 12:31:34 | 8.6s | Per troy ounce; spot reference |
| XAG | 49.254002 | 2026-11-01 12:31:33 | 10.9s | Per troy ounce; spot reference |
| XPT | 1439 | 2026-11-01 12:31:37 | 8.3s | Per troy ounce; spot reference |
| XPD | 1001 | 2026-11-01 12:31:36 | 10.7s | Per troy ounce; spot reference |
| HG | 6.537477 | 2026-11-01 12:31:36 | 12.1s | HTTP works, but unit/contract identity not established; quarantined |

Gold HTTP latency was approximately **169–521ms** for these samples. Its `updatedAt` means **provider source-fetch time**, not exchange trade time. Underlying sources/venue and market-open status are not returned. Sunday fetches can remain recent while the price is unchanged from a closed session. Accordingly the adapter emits an **indicative spot reference**, never an exchange-verified live trade. Copper is not assumed to be per pound or per ounce. Gold API BTC/ETH were catalogued but their price endpoints were not tested or integrated; existing crypto providers are preserved.

## 3. Coverage of all 40 featured instruments

At **12:44:44 UTC / 14:44:44 SAST**, all **8/40** existing featured crypto pairs had native observations under 60 seconds old; seven had at least 26 same-source candles attached at that instant. New subscriber-enabled native feeds: **0**. Eight FX pairs have technically reachable closed/indicative evaluation candidates, not eight newly approved live feeds. Four Gold API metal references are separately cached evaluation products, not replacements for the existing continuous futures.

| Core instrument | Existing/native result or tested provider candidate | Remaining identity/availability gap |
|---|---|---|
| BTC/USD | Existing exchange engine; Biquote BTCUSD 200 | Broker reference not added to exchange priority |
| ETH/USD | Existing exchange engine; Biquote ETHUSD 200 | Same |
| SOL/USD | Existing exchange engine; Biquote SOLUSD 200 | Same |
| XRP/USD | Existing exchange engine; Biquote XRPUSD 200 | Same |
| BNB/USD | Existing exchange engine; Biquote BNBUSD 200 | Same |
| ADA/USD | Existing exchange engine; Biquote ADAUSD 404 | Biquote candidate unavailable at test |
| DOGE/USD | Existing exchange engine; Biquote DOGEUSD 404 | Same |
| TRX/USD | Existing exchange engine; Biquote TRXUSD 404 | Same |
| EUR/USD | Biquote EURUSD 200, closed | Broker/upstream confirmation; indicative only |
| GBP/USD | Biquote GBPUSD 200, closed | Same |
| USD/JPY | Biquote USDJPY 200, closed | Same |
| USD/CHF | Biquote USDCHF 200, closed | Also currency metadata discrepancy |
| AUD/USD | Biquote AUDUSD 200, closed | Broker/upstream confirmation |
| USD/CAD | Biquote USDCAD 200, closed | Also currency metadata discrepancy |
| NZD/USD | Biquote NZDUSD 200, closed | Broker/upstream confirmation |
| USD/ZAR | Biquote USDZAR 200, closed | Also currency metadata discrepancy |
| Gold continuous futures | Gold XAU spot 200; Biquote XAUUSD broker 200 | Neither is COMEX GC continuous futures |
| Silver continuous futures | Gold XAG spot 200; Biquote XAGUSD broker 200 | Neither is COMEX SI continuous futures |
| WTI continuous futures | Biquote USOIL 200, closed | Broker product, not NYMEX CL continuous futures |
| Brent continuous futures | Biquote UKOIL 200, closed | Broker product, not ICE BRN continuous futures |
| Natural gas continuous futures | XNGUSD 200; NATGAS 404 | Broker product, not NYMEX NG continuous futures |
| Copper continuous futures | Gold HG 200; Biquote XCUUSD 200 | HG unit unresolved; neither established as COMEX HG continuous series |
| S&P 500 cash index | Biquote US500 200, closed | Broker reference, not official cash index |
| Nasdaq 100 cash index | NAS100 catalogued, endpoint 404 | No tested exact cash-index feed |
| Dow cash index | Biquote US30 200, closed | Broker reference, not official cash index |
| FTSE 100 cash index | Biquote UK100 200, closed | Broker contract/currency, not official cash index |
| DAX 40 cash index | Biquote DE30 200, closed | Germany 30 label is not verified DAX 40; no substitution |
| Nikkei 225 cash index | Biquote JP225 200, closed | Broker USD reference, not official JPY cash index |
| AAPL | Biquote AAPL 200, closed | Broker instrument; listing/contract not established |
| MSFT | Biquote MSFT 200, closed | Same |
| NVDA | Biquote NVDA 200, closed | Same |
| AMZN | Biquote AMZN 200, closed | Same |
| GOOGL | Biquote GOOGL 200, closed | Same |
| TSLA | Biquote TSLA 200, closed | Same |
| SPY | SPY 404; SPYUSDT 200 from aggr | USDT-suffixed product is not verified SPY listed shares |
| QQQ | QQQUSDT 200 from aggr | Not verified QQQ listed shares |
| GLD | GLDUSDT 404 | No tested exact fund-share feed |
| VTI | VTIUSDT 404 | Same |
| OANDA US500 CFD | Biquote US500 200, closed | Broker 1 is not verified OANDA; exact broker identity required |
| OANDA XAUUSD CFD | Biquote XAUUSD 200, closed | Same |

The remaining **32 core instruments** still lack subscriber-enabled native prices. Forex, commodities, indices, stocks, ETFs and CFDs therefore retain their existing TradingView visual/external alternatives. The category directory still lists all 40 even without prices. No calculated reference, CFD, spot metal, token-like product or futures series is relabelled as another product.

## 4. Commercial rights and budget

| Provider | Confirmed published permission | Unresolved / disabled capability |
|---|---|---|
| Biquote | Its [terms](https://biquote.io/terms.html) expressly allow paid in-product display, product caching and derived analysis without feed reproduction | Grants are limited to rights it holds and original-source conditions. Raw-feed resale, public feed APIs, bulk data products and misrepresentation as exchange-licensed/official benchmarks are prohibited. Broker/source-chain confirmation remains necessary for these candidates |
| Gold API | [Terms §9](https://gold-api.com/terms) expressly permit commercial apps/websites | Terms do not expressly grant standalone raw-feed redistribution, bulk resale or separately identify derived-analysis rights and underlying venues; these capabilities remain unapproved. Commercial application use is confirmed, not globally “unlicensed” |

Both live endpoints are free to access. Biquote documents **15,000 requests/minute/IP**, batch requests and Retry-After. Gold documents a **30-second update cycle**, live access without a fixed quota, and anti-spam restrictions. Its free history/OHLC allowance is **10 requests/hour combined**, requires a key, and Premium is **$10/month** ([pricing](https://gold-api.com/pricing)). No key is configured and no account/subscription was created. The adapters use much smaller application budgets, batched Biquote reads and serial Gold calls spaced at least 1.2 seconds; these are internal limits, not provider entitlements.

Estimated production base: [Vercel Pro](https://vercel.com/pricing) $20 + [Supabase Pro](https://supabase.com/pricing) $25 + these free live APIs $0 = **$45/month**, leaving **$15** of the $60 limit before email, domain/renewal, overages or any missing exchange/broker rights. Optional Gold Premium would make that $55 before those extras; it was **not purchased** and does not solve the 32 exact-instrument gaps. A fully licensed all-40 total cannot yet be quoted. Current incremental local evaluation spend is **$0**.

## 5. Implementation and configuration

- `lib/feeds/additional-providers.ts`: strict, isolated Biquote and Gold API adapters using the existing Transport. Exact metadata/source checks, explicit bid/ask midpoint, source/receipt timestamps, units, product identity hashes, stale/closed handling and source-fetch warnings. Unknown copper units are rejected. Biquote history retains tick volume separately, discards the open bar and explicitly disclaims unverified per-bar provenance; it is not hydrated into existing crypto history.
- `lib/feeds/additional-collection.ts`: collection through the existing market job and PostgreSQL Snapshot store. Atomic provider leases, ownership fencing, one-minute scheduling eligibility, durable exponential circuit backoff and Retry-After, old-cache preservation on failure and read-time stale checks. Gold and Biquote are never averaged or failed over into different products. Existing crypto failover is unchanged.
- `GET /api/markets/provider-evaluation`: local-host, authenticated administrator, cache-only diagnostics. It rejects ordinary subscribers, anonymous callers and forwarded public hosts. It never starts upstream collection. No new layout or customer pricing path was added.
- Defaults in `.env.example`: `BIQUOTE_EVALUATION_ENABLED=false`, `GOLD_API_EVALUATION_ENABLED=false`. Actual local flags remain off. Evaluation cannot activate with a public APP_URL or commercial scope. Every normalised result carries public-display, analysis and export **false**. No report or alert consumes these snapshots.
- A one-time authorised local verification cached **10 Biquote** and **4 Gold API** observations centrally. Continuous evaluation is **not running**: the existing worker was not restarted. If evaluation is later enabled locally, activate the updated worker only after the endurance run permits maintenance. No Gold historical adapter is claimed verified without a real authenticated response.

The HTTP adapters and PostgreSQL coordination do not depend on Windows or MT5. Production still requires an authenticated bounded cloud scheduler, configured Supabase connection/storage, rights approval and staging parity tests. None was deployed or migrated.

## 6. News and calendar verification

Existing Capital Data Wire, Finance Calendar and SEC EDGAR were preserved. Biquote news supplied publisher/date/URL but no stable provider article ID; URL-derived deduplication IDs would need explicit labelling. Two sampled URLs were Google News aggregations; a Hacker News item was dated June rather than a current release. Aggregation is not independent confirmation or a blanket licence to republish the underlying article. No Biquote story was promoted into subscriber news or used for causal explanations.

Calendar samples preserved provider `id`, series `eventId`, UTC time, period, currency, unit/multiplier, source URL and null actual values. A sampled ISM Manufacturing PMI event at **2 November 2026 15:00 UTC / 17:00 SAST** matches the publisher's [official release calendar](https://www.ismworld.org/supply-management-news-and-reports/reports/rob-report-calendar/). This corroborates that schedule only—not its forecast, future actual value or every other event. The feed includes MQL5/other original-source material; underlying reuse terms and revisions/scaling still require review before ingestion. Existing working feeds were not replaced.

## 7. Tests and launch blockers

**Passed:** 99 TypeScript unit tests; TypeScript checking; production build; final isolated integration run **33/33 test records, 29 scenarios** (four new provider scenarios plus 25 existing customer/feed/content scenarios). New integration tests cover concurrent collector admission, cache-only fan-out, persisted 429 backoff, preserved old timestamps, stale-lease fencing and access control. Desktop/mobile browser regression verified the 40-instrument directory and charts, with no page errors or overflow.

**Observed limitation, not hidden:** the first full integration run had three failing scenarios (five failed records including parent tests): BTC/ETH had fresh Kraken prices but zero attached same-source history, so feed history assertions failed and reports/comparisons correctly returned 503. Failure logs were preserved as `isolated-integration-first.txt`. A single rerun after observed recovery to Coinbase with 300 same-source bars passed. No engine restart, altered freshness threshold or relaxed test assertion was used. This availability gap remains a prelaunch concern.

At the 14:44 SAST checkpoint, the existing crypto run was still active with approximately **99.749%** cumulative freshness, **zero engine restarts, zero worker restarts, zero application errors** and zero engine refresh errors. Its 24-hour result remains pending until **2 November 2026 10:06 SAST**. The same engine instance and original monitoring files were preserved.

Before public paid launch: confirm Biquote broker/product identities and upstream rights; resolve metadata inconsistencies; verify Gold source/session semantics, copper units and required analysis/redistribution scope; obtain a free historical key if history is needed and validate real authenticated responses; deliberately choose spot/reference versus futures products rather than silently replacing them; secure exact remaining equity/index/futures/ETF/CFD feeds; finish cloud scheduling, production email and the full budget; resolve same-source history availability and complete endurance acceptance. Existing crypto public redistribution permissions remain a separate pre-existing approval requirement.

Local application: http://localhost:3100/markets
