# DARK MARKETS reliability results — 1 November 2026

Website: http://localhost:3100. Full implementation details and changed-file inventory: [RELIABILITY.md](RELIABILITY.md).

## Measured results

| Window | Duration | Fresh / eligible | Freshness | Source changes | HTTP requests | Quota events |
| --- | --- | --- | --- | --- | --- | --- |
| Before | 3 minutes | 1110 / 1296 | 85.6481% | 4 | 276 | 0 |
| First quote improvement trial | 10 minutes | 4317 / 4320 | 99.9306% | 22 | 931 | 0 |
| Final corrected configuration | 5 minutes | 2160 / 2160 | 100.0000% | 4 | 425 | 0 |

Sampling is every five seconds, with all 36 crypto pairs eligible and no exclusions. Missing data counts against freshness. The threshold remains 60 seconds. Per-minute source changes: 1.371 before, 0.814 final. Per-minute HTTP requests: 94.63 before, 86.45 final. Rates use actual first-to-last sample intervals; windows are different lengths and market conditions differ. This is provisional evidence, not proof of sustained 24-hour performance.

Timestamp basis in the final window: `{"exchange": {"observations": 1879, "fresh": 1879}, "receipt": {"observations": 281, "fresh": 281}}`. Kraken's receipt timestamps are disclosed and do not prove exchange trade recency. Raw source timestamps and receipt times are preserved in samples. No observations are silently excluded because an instrument is thinly traded.

The first ten-minute trial detected an old worker exit and cannot qualify for process stability. A later transitional window includes maintenance and is likewise not a clean acceptance result. These trials are preserved, not replaced with the final results.

## Confirmed causes and fixes

- A 60-second polling/cache boundary had no margin against a 60-second freshness requirement. The final configuration targets 15-second polling with bounded jitter, a shorter quote cache and earlier quote-age recovery.
- Live quote calls awaited historical candle downloads. History is now independent, single-flight, centrally scheduled and deferred while quotes refresh, with 40% of each configured HTTP allowance reserved for live work.
- Background budget failures affected live circuits. History deferrals no longer poison quote circuits; actual rate-limit cooldowns remain shared.
- Recovery had no dwell/confidence controls, and stale cached alternatives could change selection and be logged as confirmed recovery. Final recovery requires five minutes of healthy-fallback dwell and three separated validated probes. Stale/disabled/disconnected incumbents bypass dwell. Stale cache cannot count as recovery, and stale flags survive snapshot publication.
- Thin source timestamps differ from processing delays. They are recorded separately and do not open an entire provider circuit. Every actual source change now has a structured reason and quote ages.
- Empty history scans were running every 250ms. They now wait ten seconds when no work is due. Short reconnect successes no longer immediately reset exponential backoff.

## Actual request usage in the final window

| Provider | HTTP requests | Configured requests/minute cap | Recorded quota events |
| --- | --- | --- | --- |
| binance | 145 | 120 | 0 |
| coinbase | 179 | 120 | 0 |
| kraken | 95 | 120 | 0 |
| coingecko | 6 | 5 | 0 |

Request totals include live data, discovery/health and background history; they are not exchange weight invoices or proof of commercial permissions. No paid account or API subscription was purchased.

## Engine and worker stability

Final window: 0 engine restarts, 0 worker restarts, 0 engine errors, 0 unhealthy worker samples, 0 application errors. Peak sampled engine RSS 192.5 MiB; worker RSS 145.0 MiB. This does not establish absence of a long-term memory leak or large-user capacity.

The old worker exited at approximately 07:45 UTC and logged only a generic Error; the exact underlying exception is not retrospectively recoverable. The replacement has independent process heartbeats, separate job-health state, PID-specific temporary files, bounded Windows file-sharing retries, structured redacted diagnostics and tick retry/backoff. It does not report a stuck/failed job loop as healthy merely because its process is alive. The failure and subsequent maintenance remain in all applicable trial evidence.

## Historical data

The latest audit validated 144 entries: 36 each for 1m, 5m, 1h and daily. Invalid entries: 0. Entries containing genuine gaps: 2. Gaps depend on the selected provider and time window; they are not filled. The initial audit found eight gapped entries, and later genuine source collections changed that count. The earlier engine snapshot recorded 94 accumulated recoverable history failures; see final health evidence for new-process counters. Historical source attribution is separate when fallback differs from the current quote.

## Tests and UI

79 unit tests pass. Existing integration suites pass 14 customer-journey, five live-engine and six free-content/admin scenarios (25 scenarios total). TypeScript and production build pass. Desktop/mobile checks cover all global sections, the native crypto chart, admin, dashboard, news and calendar; no page errors or horizontal overflow. Vendor requests aborted during navigation are recorded separately.

Admin now includes quote age/freshness, receipt timestamp basis, provider latency/circuits/quota counters, WebSocket state, history failures, worker/job health, source switch reasons and preserved maintenance/acceptance metadata. Existing branding, account data, seven-day trials, subscriptions, news, calendar and SEC functionality remain intact.

## Endurance status and remaining work

Original run: `running`, elapsed 9.12 hours, original start `2026-10-31T22:58:58.049Z`. It contains old freshness failures, worker failure and recorded maintenance, and cannot qualify as a clean uninterrupted pass. Its original logs and timestamps were retained. At this report snapshot it recorded 8 engine restarts, 6 worker restarts and 1 monitor restart across the original run; these include earlier-session maintenance and this task's recorded interruptions, not just the final configuration.

The new clean acceptance run is `work/reliability/acceptance-v5`, started `2026-11-01T08:06:21.448Z`, due `2026-11-02T08:06:21.448Z`. It is running, not a completed pass. Earlier acceptance trials remain with `interruption.json` sidecars; they are not running clean tests. The active pointer and admin refer to the new run.

Required follow-up: let the complete 24 hours elapse, review freshness by timestamp basis and thin instrument, confirm sustained source-switching improvement, inspect any new worker error codes, and conduct separate full-stack capacity testing before large-scale/public use. Native non-crypto backends and commercial redistribution permissions remain separate outstanding work. No live billing or public deployment was activated.

## Evidence

Ignored local evidence: `work/reliability/before/`, `after/`, `verified/`, `comparison.json`, `history-audit.json`, `final-health.json`, `acceptance-v5/`; original `work/endurance/`; `work/reliability-*-results.txt` and `work/reliability-browser-results.json`. [Changed files and operational details](RELIABILITY.md).
