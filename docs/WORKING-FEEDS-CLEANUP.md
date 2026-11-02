# Working feeds and targeted cleanup — 1 November 2026

Local site: http://localhost:3100/markets. No deployment, purchase, branding, subscription or billing changes.

## Before and after

| Display | Before | After |
| --- | --- | --- |
| Featured registry | 40 across seven categories | Same 40, same IDs, types and chart actions |
| Categories | Crypto 8, Forex 8, Stocks 6, Indices 6, Commodities 6, ETFs 4, CFDs 2 | Identical |
| Featured native prices | Eight crypto instruments | Same eight; no synthetic fallback |
| Ordinary Markets non-crypto observations | None; observations confined to administrator evaluation | Gold/Silver related spot references in existing commodity price cells; Platinum/Palladium references in broader discovery |
| Native futures prices | Unavailable | Still unavailable; spot references explicitly distinct |
| Local MT5 | Disconnected bridge, zero observations | Process stopped; application integration/source/configuration removed |

Authenticated browser verification at 2026-11-01T13:21:59Z observed 36 genuine crypto-engine results across Coinbase Exchange, Binance Spot and Kraken. Featured BTC, ETH, SOL, XRP and BNB USD observations came from Coinbase; ADA, DOGE and TRX USD from Kraken. These are observations at that time, not a guarantee of subsequent freshness. Existing priority, source attribution, rate limits, failover and streaming are unchanged.

Gold API cached observations: XAU/USD 3876.399902, XAG/USD 49.254002, XPT/USD 1439, XPD/USD 1001, all USD per troy ounce. Source-fetch times 13:21:04–13:21:07Z, receipts 13:21:33–13:21:37Z. Provider timestamps describe source fetch, not an exchange trade. Session is unknown; references are indicative, never asserted live. Read-time age exceeding 60 seconds marks them stale. These observations were actually refreshed through the existing administrator collector, not fabricated.

## Exact implementation

`app/api/[...path]/route.ts`: `/markets` returns a separate authenticated, local-only `spotReferences` projection from the shared Gold snapshot. It does not collect upstream, change native `quotes`, or grant analysis/export permissions. The removed MT5 gateway is replaced by the existing `engineFetch` client directly. MT5 routes are gone (verified 404).

`lib/spot-display.ts`: small pure validation/projection function `websiteSpotReferences`, restricted to four verified USD/troy-ounce spot products and their exact source IDs/timestamp semantics. Rejects unknown units, wrong currency/source/identity, future timestamps and invalid prices. This is not a provider engine or dashboard.

`app/terminal.tsx` and `app/market-directory.tsx`: retain the current directory, filter, registry and chart actions. Pass the separate references from existing polling into corresponding commodity rows. The actual futures price remains Unavailable, followed by explicitly labelled related spot reference, currency/unit, attribution, source/receipt timestamps, age, latency and indicative/stale status. No reference is substituted into a futures/CFD/ETF native quote, chart, report, alert or comparison.

`app/market-data-evaluation.tsx`: clarify existing display-rights wording for the four verified spot products. Existing administrator evaluation and bounded manual refresh remain; no new screen.

## Removed files and functions

- `app/mt5-panel.tsx` — optional `Mt5Panel` and its local polling/rendering.
- `lib/feeds/mt5-client.ts` — bridge configuration, contract/tick schemas, MT5 validation, local-scope check and `mt5Fetch`.
- `lib/feeds/local-gateway.ts` — `marketDataFetch` MT5 dispatcher; crypto passthrough replaced with existing client.
- `scripts/start-mt5-bridge.ps1` — bridge launcher.
- `tests/mt5.test.ts`, `tests/mt5-integration.test.ts` — tests for removed feature; MT5 package test commands removed.
- `bridge/mt5/config.example.json`, `model.py`, `README.md`, `requirements.txt`, `service.py`, `terminal.py`, `test_bridge.py` — bridge source, Python dependencies declaration, polling/cache/HTTP service, terminal implementation and tests.
- `docs/MT5-BRIDGE.md` — obsolete setup guide. Current STATUS opening updated; broken setup link removed.
- `work/mt5/config.json`, `data.json`, `process.json`, `browser-check.cjs`, `verify.cjs` — private bridge configuration/token, cache, launch record and obsolete harnesses.
- `BiquoteAdapter.quotes` in `lib/feeds/additional-providers.ts` — duplicate older ten-symbol batch path, referenced only by its unit test. Production uses `inspectionQuotes`; batching/cache/missing-data test now exercises that retained implementation.
- API `markets/mt5/*` branch, terminal MT5 import/render, package MT5 test configuration.

The bridge health was authenticated and verified `terminal_not_running`, connected false, readOnly true before removal. Only its verified Python processes 43796/40740 were stopped. No terminal installation outside the repository was touched.

**Cleanup limitation:** automatic command policy rejected recursive removal of the remaining `work/mt5/venv` and residual MT5 directories. The orphan environment, old logs/screenshots and `bridge/mt5/__pycache__` therefore remain on disk. They have no running process, configuration/token or application import. Do not interpret this report as full dependency-directory deletion. No alternate deletion mechanism was used to bypass the rejection.

## Retained code

Coinbase, Kraken, Binance, CoinGecko and Twelve Data adapters, crypto engine, caches, fan-out, rights/failover/recovery controls and history remain. Inactive/fallback configuration is not proof of obsolete code. Biquote's working inspection collector, normalisers, provenance-preserving historical adapter and durable collection leases remain for local evaluation. Gold API's working adapter/collector/cache remain. TradingView quote widgets and exact charts, shared transport, news/calendar, SEC, authentication, reports, alerts, subscriptions and all ongoing reliability scripts remain.

Historic reports mentioning an earlier MT5 experiment remain historical evidence. Biquote's provider source strings mentioning MetaTrader are upstream attribution, not dependencies on the removed local bridge. No production imports, test commands or setup links to deleted modules remain. Generic Python-cache ignore rule retained because orphan caches remain.

## Rights and remaining configuration

[Gold API terms §9](https://gold-api.com/terms) expressly permit operated commercial website/app use; [FAQ](https://gold-api.com/faqs) confirms precious-metal spot identity, troy-ounce units, source-fetch timestamps, undisclosed upstream aggregation and caching guidance. Checked 2026-11-01. This narrowly supports separate website spot references, not relabelling futures/CFDs or enabling raw redistribution, analysis or bulk exports. Existing evaluation public/analysis/export flags remain false. Production/public deployment remains disabled.

[Biquote terms](https://biquote.io/terms.html) make commercial use conditional on upstream conditions. Broker legal identity, exact contracts, listing/currency mismatches and upstream display permissions remain unresolved. Its 27 observations remain administrator-only. At refresh, 25 were closed/stale prior-session observations; two USDT-labelled ETF-like products were indicative with unresolved identity. Gold API HG copper units remain unverified and excluded from ordinary price displays. Exact cash indices, exchange futures, listed stocks/ETFs, OANDA contracts and broker FX do not gain native prices from these references.

Automatic additional collection remains OFF. Existing manual administrator refresh works with durable cooldowns. Consequently references become stale after one minute without refresh. The existing worker predates the additional-collector hook; enabling scheduled Gold collection requires a planned worker reload and configuration review **after** the endurance run, not during it. No new scheduler, per-visitor collection, provider system or permission flag was introduced to work around this restriction.

## Verification

- 103 unit tests pass (three removed MT5 cases, three added spot display regressions). Existing outage, rate-limit, disconnect, mismatch, stale, failover and category visibility cases retained.
- TypeScript `tsc --noEmit` passes.
- Production build passes, including Prisma client generation and Next compilation/type checking.
- 34 integration test records pass, zero skipped, covering 30 scenarios: additional provider durable leases/cache/rights; crypto HTTP/SSE/history; news/calendar/SEC; authentication, reports, alerts/customer journey and test subscriptions/webhooks; new authenticated cache-only website reference boundary and removed MT5 route. Run against a uniquely named scratch PostgreSQL database and isolated production server on 3101. Scratch database/server removed; primary services untouched. Integration fixtures never entered the primary database.
- Browser: all category counts/IDs match All Markets; all 40 have their original chart actions; Gold/Silver separate spot references visible to ordinary authorised user; native futures unavailable; four Gold refs in API; Biquote/Gold absent from native quotes; anonymous/member/admin boundaries; MT5 404. Administrator evaluation still shows 32 real cached observations. Desktop and 390px mobile checks pass without document overflow or page errors. DAX widget and native crypto chart actions tested.
- `work/working-feeds/`: unit/typecheck/build/integration logs, category results, actual feed metadata and desktop/mobile screenshots. Existing evaluation screenshots/logs in `work/evaluation-view/`.
- Reliability `acceptance-v5` remains running with original engine instance `a26c39f3-080f-4d46-9833-3557bde80eb9`; zero engine/worker restarts and zero application errors at verification. This is not a completed 24-hour pass. Deadline 2026-11-02T08:06:21Z.
