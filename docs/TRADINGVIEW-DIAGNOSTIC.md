# TradingView missing quotes diagnostic — 1 November 2026

## Verified cause

The ten failing core identifiers are valid. Official Market Quotes reports **“This symbol is only available on TradingView”** in its error-icon tooltip; Advanced Chart reports the same restriction in its visible notification. TradingView's own [data FAQ](https://www.tradingview.com/widget-docs/faq/data/) explains this as a restriction on showing that symbol in widgets, in any timeframe. This is a **vendor embed-distribution limitation**, not an invalid `EXCHANGE:SYMBOL` format, a DARK MARKETS database/cache failure, or evidence that buying an individual TradingView subscription will unlock the website. The FAQ explicitly says individual paid upgrades do not change widget data.

The widgets use the documented `symbolsGroups: [{name, symbols:[{name,displayName}]}]` Market Quotes configuration and `symbol`, `interval`, `theme`, `autosize` Advanced Chart settings. Both use official external-embedding scripts and attributed links. Identically configured DAX, Nikkei, SPY and OANDA controls displayed values. Literal `1!` futures identifiers are legitimate continuous series: the official [gold](https://www.tradingview.com/symbols/COMEX-GC1!/), [silver](https://www.tradingview.com/symbols/COMEX-SI1!/), [WTI](https://www.tradingview.com/symbols/NYMEX-CL1!/), [Brent](https://www.tradingview.com/symbols/ICEEUR-BRN1!/), [gas](https://www.tradingview.com/symbols/NYMEX-NG1!/) and [copper](https://www.tradingview.com/symbols/COMEX-HG1!/) pages identify them as continuous contracts. Dated-contract probes were also restricted, confirming that simply removing `1!` is not a fix.

The specific underlying exchange/vendor contract behind each restriction is not disclosed by the widget. We can verify the displayed restriction and published vendor explanation; we cannot establish a negotiated exchange entitlement or promise that another paid feed will unlock these embeds.

## Instrument results

All rows below failed **both** original-symbol widgets. No same-identity corrected ticker was found; the original symbols remain the canonical requested products. The last column lists separately tested related views, **not corrected equivalents**.

| Requested instrument | Exact original symbol | Verified result / additional probe | Separately labelled related view that displayed |
|---|---|---|---|
| S&P 500 cash index | `SP:SPX` | Embed restriction. `TVC:SPX` had no Market Quotes value and was restricted in Advanced Chart | `FOREXCOM:SPXUSD` — FOREX.com US 500 CFD; not the official cash-index feed |
| Nasdaq 100 cash index | `NASDAQ:NDX` | Embed restriction. `TVC:NDQ` had no Market Quotes value and was restricted in Advanced Chart | `FOREXCOM:NSXUSD` — FOREX.com US 100 CFD |
| Dow Jones cash index | `DJ:DJI` | Embed restriction. `TVC:DJI` had no Market Quotes value and was restricted in Advanced Chart | `FOREXCOM:DJI` — FOREX.com US Wall Street 30 CFD |
| FTSE 100 cash index | `FTSE:UKX` | Embed restriction. `TVC:UKX` had no Market Quotes value and was restricted in Advanced Chart | `FOREXCOM:UKXGBP` — FOREX.com UK 100 CFD, GBP broker quote units |
| Gold continuous futures | `COMEX:GC1!` | Embed restriction; December 2026 `COMEX:GCZ2026` also restricted | `TVC:GOLD` — TradingView-calculated gold reference / CFD-style product; neither COMEX futures nor a verified native spot feed |
| Silver continuous futures | `COMEX:SI1!` | Embed restriction; December 2026 `COMEX:SIZ2026` also restricted | `TVC:SILVER` — separately labelled calculated reference |
| WTI continuous futures | `NYMEX:CL1!` | Embed restriction; December 2026 `NYMEX:CLZ2026` also restricted | `TVC:USOIL` — separately labelled calculated oil reference; not the NYMEX rolling contract |
| Brent continuous futures | `ICEEUR:BRN1!` | Embed restriction; January 2027 `ICEEUR:BRNF2027` also restricted | `TVC:UKOIL` — separately labelled calculated oil reference; not ICE Brent futures |
| Natural gas continuous futures | `NYMEX:NG1!` | Embed restriction; December 2026 `NYMEX:NGZ2026` also restricted | `FX:NGAS` — FXCM broker CFD/reference; not NYMEX futures |
| Copper continuous futures | `COMEX:HG1!` | Embed restriction; December 2026 `COMEX:HGZ2026` also restricted | `CAPITALCOM:XCUUSD` — Capital.com copper CFD. `CAPITALCOM:COPPER` also displayed, but the explicit XCUUSD listing is retained |

The related views displayed in both widgets during the test. A displayed value or rendered historical chart does **not** prove that its latest observation is current. Tests occurred on Sunday, 1 November 2026; no “live” claim is made for these references or CFDs. Exact contract sizes and subscriber-specific broker availability are not established by widget display.

TradingView [documents TVC](https://www.tradingview.com/support/solutions/43000709178-what-does-tvc-stand-for-in-the-instrument-ticker/) as calculated data from different sources, often CFD-style/reference instruments. It explicitly distinguishes these from exchange/provider counterparts. Using `TVC:SPX` as an automatic replacement for `SP:SPX` would therefore be misleading even if it displayed. The official [widget example](https://www.tradingview.com/widget-docs/widgets/watchlists/market-overview/) also uses FOREXCOM symbols, but example descriptions are not a licence to call a broker product the official index. The application uses explicit CFD labels.

## Functioning controls and timing

| Symbol | Market Quotes | Advanced Chart | Observed timing limitation |
|---|---|---|---|
| `XETR:DAX` | Value displayed | Chart rendered | **End of Day** tooltip; do not call live |
| `INDEX:NKY` | Value displayed | Chart rendered | **End of Day** tooltip; do not call live |
| `AMEX:SPY` | Value displayed | Chart rendered | **15-minute delayed** tooltip; chart can show Cboe One rather than requested listing |
| `OANDA:SPX500USD` | Value displayed | Chart rendered | Broker CFD; current observation age not independently established |
| `OANDA:XAUUSD` | Value displayed | Chart rendered | Broker CFD; not a native spot-gold API; current observation age not independently established |

The independent test fixture ran **36 symbols × 2 widget types**: ten originals, four TVC index references, ten other related reference/CFD candidates plus one copper alias, six dated contracts and five functioning controls. Results: 16 symbols explicitly restricted in both widgets (ten originals + six dated contracts); four TVC index references missing values in Market Quotes and restricted in Advanced Chart; 16 candidates/controls displayed a value and a chart. These are diagnostic display results, not live-data availability guarantees.

## Changes made after investigation

- `lib/tradingview-availability.ts` records widget-specific availability, check date, verified restriction reason, exact external link and separately identified related product. Quote and chart support are separate fields. There was **no original-symbol case** where Advanced Chart worked while Market Quotes failed. The view supports an exact embedded chart if a future verified entry has that combination.
- The main Market Quotes frame excludes only the ten diagnosed failing rows, and only alongside a labelled alternative-view entry for each exact identity. The 40 core definitions and original chart selector remain intact. With all core markets selected, 30 rows remain in the quote widget. Indices retain DAX/Nikkei; commodities show explicit unavailable notices and six alternative-view entries rather than six error rows.
- Each omitted row retains an **exact external TradingView chart link**, which may have its own login, entitlement or delay conditions. The user can explicitly select a **different product** to open a related CFD/reference chart in a separate panel. It never appears under the original instrument's name in the main quote table and never enters native data, reports, alerts or AI.
- Known restricted Advanced Chart embeds show a clear notice and exact external link instead of loading a predictable vendor error dialog. Functioning charts, source attribution, broker metadata and existing branding remain.
- Overview copy explicitly distinguishes displayed, delayed, end-of-day and previous-session values from live prices. Stable quote-widget configuration is retained across native-price refreshes.

## Validation and operational limits

- **88 TypeScript unit tests passed**, including preservation of exact identities, all ten fallback links, functioning controls, no silent core substitution and the all-unavailable commodities section.
- **25 integration scenarios passed** (28 test records including parent tests): customer journey/auth, reports/alerts, native feed/SSE/history and content/provider controls. These ran against a disposable PostgreSQL database and a temporary production test server on 3101. The disposable database/server were removed; the monitored database and application were not restarted.
- TypeScript checking and the production build passed. Visual regression checks exercise filtered quote counts, all exact links, distinct related-product labels, original selector retention, no restricted iframe, stable frame across refresh, native-feed isolation and desktop/mobile layout. Evidence is under `work/tradingview-diagnostic/`.
- Browser diagnostics inspect only rendered error/timing indicators and whether a value is visibly present; screenshots retain visual evidence. They do **not** capture quote numbers into datasets, intercept feed responses, scrape a raw price feed or expose any TradingView iframe as an API.
- No deployment, purchase, billing change, exchange-collector modification or crypto-monitor restart was performed. The local application remains at **http://localhost:3100/markets**. The ongoing 24-hour acceptance result remains pending; restriction observations can change and should be rechecked before public launch.

To obtain exact native cash-index/futures prices, secure an appropriately licensed provider with the required exchange, product, delay, storage and analysis permissions. TradingView's own paid personal plan is not an embed entitlement upgrade. There is no verified symbol-only fix for the ten original products.
