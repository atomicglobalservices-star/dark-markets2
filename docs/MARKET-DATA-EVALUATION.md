# Administrator Market Data Evaluation — 1 November 2026

Reload http://localhost:3100/markets. The existing local account is now an administrator, following explicit user approval. No subscription, billing, password or market-data commercial permission was changed. The role change is recorded as `local.admin.granted` in the audit log.

## Working display

An administrator-only **Market Data Evaluation** section now appears on Markets, using the existing DARK MARKETS panel/table styling. Ordinary subscribers do not see it and receive HTTP 403 from its API. Anonymous cache requests receive HTTP 401; public/forwarded hosts and invalid mutation origins are rejected.

At **15:06:40 SAST / 13:06:40 UTC**, the authenticated browser displayed **32 actual non-crypto provider observations**:

| Source / product group | Count | Observed classification |
|---|---:|---|
| Biquote FX references | 8 | Closed, stale broker bid/ask midpoints |
| Biquote metals/energy references | 6 | Closed, stale; broker products, not exchange continuous futures |
| Biquote index references | 5 | Closed, stale; not official cash indices |
| Biquote stock-labelled broker products | 6 | Closed, stale; exact listing/contract unresolved |
| Biquote SPYUSDT / QQQUSDT | 2 | Indicative aggregated products; currency/product ambiguity explicit |
| Gold API XAU / XAG / XPT / XPD | 4 | Indicative spot references, USD per troy ounce; session unknown |
| Gold API HG | 1 | Observed copper reference, unit/contract unverified; no conversion applied |
| **Total** | **32** | **25 closed and stale; 7 indicative** |

Closed and stale counts overlap: the same 25 last-session observations have both properties. Their source dates remain **30 October 2026**, even after a successful refresh. The seven indicative observations are not claimed as current exchange trades. Gold API's `updatedAt` is explicitly labelled **provider-source-fetch** time; its market session and underlying venue are unknown. Copper's number is inspectable without weakening the strict production quote adapter's rejection of unknown units.

Closed/stale Biquote symbols: **EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD, NZDUSD, USDZAR; XAUUSD, XAGUSD, USOIL, UKOIL, XNGUSD, XCUUSD; US500, US30, UK100, DE30, JP225; AAPL, MSFT, NVDA, AMZN, GOOGL, TSLA**. Indicative records: Biquote **SPYUSDT, QQQUSDT** and Gold API **XAU, XAG, XPT, XPD, HG**. These classifications describe the captured refresh; cache ageing continues visibly afterward.

All rows show observed price, product description, immutable provider identity, currency/unit or their unresolved status, bid/ask where supplied, source attribution, venue or “not disclosed”, source timestamp, receipt timestamp, latency, source age, receipt age, session and stale status. Every observation retains subscriber-display, analysis and export permissions **off**. Visible wording is **EVALUATION ONLY — NOT APPROVED FOR SUBSCRIBER DISPLAY**. No values were simulated, converted from an unverified unit, averaged or substituted into another product.

## Read and refresh controls

Previously the cache reader filtered out every provider when the automatic collection switches were off. Inspection is now separate from scheduling: a local administrator can read the existing cache regardless of those switches. `BIQUOTE_EVALUATION_ENABLED` and `GOLD_API_EVALUATION_ENABLED` remain **false**; no unattended collection was activated and the running worker was not restarted.

The **Refresh evaluation observations** button makes an authenticated, same-origin POST to the existing evaluation endpoint, for Biquote, Gold API or both. It calls the existing collector, not a new engine. The provider set and instrument set are bounded; arbitrary symbols/URLs cannot be requested. A refresh performs at most one Biquote catalogue request plus one batch, and one Gold catalogue request plus five spaced price requests. Provider caches can reduce that further. Durable provider leases enforce the minimum collection interval/circuit cooldown across administrators, and the endpoint additionally allows three refresh requests per administrator per minute. Existing Retry-After, exponential backoff and stale-lease fencing remain active.

GET requests only read central caches and the existing local engine snapshot. They do not collect upstream prices. Failed/missing individual observations retain previous cached values with original timestamps and a stale/no-new-response warning. Neither manual refresh nor cache inspection enables public redistribution, analysis, exports, trading or scheduled collection.

## Normal market visibility and diagnostics

All **40 core instruments** remain in the normal category directory: 8 crypto, 8 forex, 6 commodities, 6 cash indices, 6 stocks, 4 ETFs and 2 OANDA CFDs. Existing TradingView quotes, exact external links and separately labelled related visual alternatives remain intact. The evaluation observations never enter `/api/markets`, alerts, reports or normal subscriber prices.

Each unavailable native row now has a direct product/permission explanation. The evaluation view also provides detailed per-core-instrument diagnostics covering disabled automatic collection, missing responses, stale candidates, closed sessions, unresolved identity, unapproved subscriber display and missing exact instruments. Examples:

- Gold API XAU/XAG are spot references; they do not fill COMEX gold/silver continuous-futures rows.
- Biquote US500 is not the official S&P 500 cash index and is not verified as an OANDA US500 CFD.
- Biquote DE30 is not verified DAX 40; stock/USDT products are not verified listed shares.
- NAS100, GLD and VTI lack successful exact native candidates; their core rows remain visible and unavailable.
- Provider currency metadata disagreements for USDCHF, USDCAD and USDZAR are shown explicitly alongside symbol-derived countercurrency labels.

## Commercial display assessment

[Gold API terms §9](https://gold-api.com/terms) expressly permit commercial use in operated websites/apps, and its [FAQ](https://gold-api.com/faqs) describes XAU/XAG/XPT/XPD as spot prices per troy ounce. That published permission covers a separately labelled website display of these four spot-reference products through the tested free price endpoint. It does not turn them into futures, establish an exchange trade timestamp, resolve copper's unit or automatically enable additional capabilities. All five remain administrator-only in this implementation. Analysis, bulk exports, raw-feed redistribution and subscriber activation were not switched on or treated as newly granted.

[Biquote terms](https://biquote.io/terms.html) allow paid in-product display conditionally on rights it holds and original-source conditions. Broker/source identities, specific contracts and upstream display conditions remain unresolved for these observations. **No Biquote subscriber-facing quote was enabled.** No raw public feed/export was added.

## Verification

- **103 unit tests passed**, including missing-price membership, diagnostic reasons, closed/stale preservation, inspectable-but-unverified copper, nullable broker venues and ambiguous USDT products.
- **33 integration test records / 29 scenarios passed** in an isolated database and temporary production test server. Coverage includes cache reads with automatic switches off, manual refresh cooldown, invalid provider/origin rejection, ordinary-user denial, unchanged subscriber feeds, durable backoff and lease fencing. The scratch database/server were removed.
- TypeScript checking and production build passed.
- Authenticated browser testing refreshed the real providers, displayed 32 rows, checked all 40 normal directory rows, confirmed desktop/mobile without page errors or page overflow, then downgraded only its temporary fixture account and verified both GET/POST denial and absence of the administrator panel. The temporary fixture account was removed. The separately authorised existing-account administrator role remains.
- Existing crypto acceptance monitoring is still running with the same engine instance, **zero engine restarts, zero worker restarts and zero application errors**. No MT5 installation, deployment, purchase or live-billing activation occurred.

Evidence: `work/evaluation-view/browser-results.json`, unit/integration/typecheck/build logs, and these screenshots:

- `work/evaluation-view/evaluation-desktop.png` — administrator overview and Biquote observations.
- `work/evaluation-view/gold-desktop.png` — spot references, quarantined copper and source/receipt/session columns.
- `work/evaluation-view/evaluation-mobile.png` — mobile administrator view; tables scroll horizontally.
