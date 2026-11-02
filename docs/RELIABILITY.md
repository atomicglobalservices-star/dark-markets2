# Market reliability improvements — 1 November 2026

Local application: http://localhost:3100. This work preserves branding, accounts, trials, subscriptions, news, calendar, SEC, all existing providers and test-only billing. No public deployment or API purchase occurred.

## Confirmed causes

1. REST polling and engine cache lifetime were both 60 seconds, exactly the freshness requirement. Network latency, sequential processing and cache checks could push refresh beyond the boundary or reuse a cached result for an additional cycle. The inspected old snapshot included fresh receipts carrying older exchange trade timestamps.
2. Every REST quote also awaited hourly candle hydration, including a once-per-minute REST hydration attempt despite a healthy Binance stream. This delayed publishing live quotes and competed for the same request budgets.
3. Background history budget exhaustion changed the live provider circuit. Provider recovery always retried priority order without dwell or multiple validated probes, causing avoidable source changes. Recent cached quotes already protected against busy health probes; that protection is preserved.
4. A scheduler scanned all instrument/timeframe combinations every 250ms when no work was due. Its `reads` counter reflected internal cache scanning, not page views or external requests. The inspected old process recorded over 21 million such reads.
5. Thinly traded symbols can have an old exchange trade timestamp despite a recent HTTP receipt. This is genuine source age and cannot be fixed by replacing exchange timestamps with local time. Kraken explicitly provides receipt timestamps for its timestamp-less ticker.

## Implementation

- Default/local quote poll target is 15 seconds, with bounded jitter and a cache lifetime shorter than the polling target. Collection duration is additional to the timer delay. The stale threshold remains **60 seconds**. Healthy stream updates avoid REST quote/history hydration.
- Each completed quote is published into the shared snapshot without waiting for the full sequential collection cycle. Newer socket observations win REST races. Hourly candles are attached only from same-provider history, including restored checkpoints.
- Runtime switches use five-minute minimum dwell while the incumbent remains valid, three validated preferred-provider probes at least 30 seconds apart, existing circuit cooldowns, and a 15-second refresh headroom. Bad/stale/disabled/disconnected incumbents can fail over immediately. The headroom starts recovery early; it does not extend the freshness threshold or retimestamp data.
- Thin/old source timestamps are recorded by provider/instrument and do not open the entire provider circuit. Every source switch has an instrument, timestamp, old/new provider, reason and quote ages. The last 200 are available in admin; structured events are also written to engine stdout.
- History is independent of live quotes, single-flight by instrument/timeframe, centrally scheduled and suspended during live refresh. Its HTTP requests cannot consume the last 40% of a provider's request budget. Deferred background work does not trip live quote circuits; genuine HTTP rate limits still apply to all requests. Existing Retry-After and deduplication are retained.
- Coinbase 24-hour statistics cache for 60 seconds, independently of fresh ticker requests. No new endpoint or identity/quota evasion was introduced. Request caps remain 120/min for configured exchanges and 5/min for CoinGecko locally.
- Empty history scans back off for ten seconds. Failed history collections keep prior data with backoff and a bounded failure log. Missing intervals are recorded; charts show gap breaks and cache-staleness warnings rather than manufacturing candles.
- Brief WebSocket reconnect successes do not reset exponential backoff until the connection has lasted a minute. Duplicate close/error events remain generation-guarded. One combined upstream Binance connection is retained.
- Admin displays snapshot freshness/denominator, per-instrument source and receipt age, timestamp basis, provider latency, circuits, usage/cooldowns, switching reasons, stream state, engine uptime, history failures and worker heartbeat.

## Measurement protocol

`scripts/reliability-monitor.ts` samples every five seconds. Every one of the 36 configured crypto pairs contributes to the denominator on each sample. Missing observations count as failures; there are no exclusions. Fresh means status is not stale and source age is at most 60 seconds, allowing at most five seconds of clock skew into the future. Source timestamps, receipt timestamps, timestamp basis and ages are persisted per sample. Receipt-timestamp observations are counted separately and are **not proof of exchange trade recency**.

The three-minute baseline has 36 samples / 1,296 observations: 1,110 fresh (**85.6481%**), 186 old source timestamps, 123 old receipts, four source changes and 276 HTTP requests during the measured interval, with zero observed quota events or process restarts. This is a new comparable baseline, not the earlier 88.76% cumulative endurance figure. Before/after windows have different lengths and provider selection can change.

The first after benchmark ran for ten minutes: 4,317/4,320 fresh observations (99.9306%). It detected a worker exit and did not qualify for clean stability acceptance. Source switching was 22 changes versus four during the three-minute baseline; normalised switching did not improve in that trial. Recovery was therefore tightened to a five-minute healthy-source dwell with three probes. Further regression testing found stale cached fallbacks could be counted as preferred recovery and the central snapshot could replace a stale result with an unlabelled cached quote. Both are corrected. Valid incumbents can remain only until the actual 60-second deadline; stale fallback cannot change selection, disabled providers cannot escape through retained cache, and stale flags survive snapshot publication. A separate five-minute final benchmark in `work/reliability/verified` runs against the final configuration. The final measured results (including the `finalStable` field) and per-provider request deltas are recorded in `work/reliability/comparison.json`. Raw evidence remains in `work/reliability/before/` and `after/`. Do not interpret a short-window target result as a completed 24-hour pass or all-instrument exchange trade freshness.

## Validation

79 unit tests pass, including original tests and focused reliability regressions. Integration results: 14 customer-journey scenarios, five live-engine scenarios, six free-content/control scenarios. TypeScript and production build pass. Desktop/mobile checks cover category-filtered markets, admin diagnostics, dashboard, news and calendar. Vendor loads cancelled when navigating tabs are distinguished from page errors.

The read-only history audit validates 144 cache entries (36 each for 1m, 5m, 1h and daily), exact instrument/quote/provider mappings, sorted/aligned/closed timestamps and OHLC constraints. The initial audit had **zero invalid entries and eight entries with genuine gaps**. A cached entry is not evidence of complete history. Run `node --import tsx scripts/audit-history.ts`; details are in `work/reliability/history-audit.json`.

## Endurance and clean acceptance

The original `work/endurance` run retains its timestamps, samples and findings. Essential engine and worker activations during this task are recorded in `work/endurance/maintenance.jsonl`; the original monitor was left running. The old worker unexpectedly exited at approximately 07:45 UTC with only a generic Error logged. Its underlying exception cannot be confirmed retrospectively. The replacement worker has an independent five-second atomic heartbeat, PID-specific temporary files, bounded Windows sharing-error retries, structured error codes/messages with database URLs redacted, and recoverable tick backoff. Job-health failures remain unhealthy even while the process heartbeat is fresh; stuck job ticks are flagged after five minutes. Heartbeat I/O failures no longer terminate the job loop. Its restarts and below-target cumulative freshness prevent a clean pass.

A separate finite 24-hour run starts through `scripts/start-reliability-acceptance.ps1`, writing to a new named directory. The active clean run is recorded in `work/reliability/active.json`; the final acceptance run is started only after final benchmark validation. The earlier `acceptance`, `acceptance-v2`, `acceptance-v3` and `acceptance-v4` trials are preserved and stopped, with failure/maintenance reasons in their `interruption.json` sidecars; their old summary status must not be interpreted as a running clean run. The launcher refuses to overwrite existing evidence. Inspect `summary.json`, `samples.jsonl`, `process.json` and `stderr.log`. `passed` cannot be true before 86,400 elapsed monotonic seconds, and also requires at least 99% freshness, 95% sampling coverage, no engine/worker restarts, no unhealthy process/API samples and recorded switch reasons. It does not automatically erase evidence or restart itself on failure. Sleep/network outages and monitor interruption must remain visible; do not claim a clean run from stale status alone.

## Files changed for this task

- `lib/feeds/engine.ts`, `config.ts`, `providers.ts`, `transport.ts`, `types.ts`, `binance-stream.ts`, `central-schedule.ts`, `runtime-health.ts`, plus `lib/worker-runtime.ts`.
- `scripts/market-engine.ts`, `reliability-monitor.ts`, `start-reliability-acceptance.ps1`, `audit-history.ts`, `compare-reliability.ts`, `worker.ts`.
- `app/terminal.tsx` (existing chart/admin diagnostics only), protected `app/api/[...path]/route.ts` (worker health metadata), `tests/feeds.test.ts`, `tests/reliability.test.ts`, `tests/free-data-integration.test.ts`, `package.json`, `.env.example`, local ignored `.env`, and reliability/status documentation.

## Remaining limits

The 24-hour acceptance run is pending. The first post-change worker crash is a recorded failure, not a clean pass; its original generic log cannot establish a precise cause. The final worker changes need full-duration verification. The final five-minute window is provisional and cannot prove sustained source-switching reduction. Keep monitoring thin symbols, timestamp basis and switching rates. Full authenticated multi-user capacity and memory-leak testing are not established by these short measurements. Request counts are local HTTP counters, not exchange invoice/weight guarantees; shared-IP demand outside this application is not measured. Public API connectivity still does not grant commercial redistribution rights. Native non-crypto feeds remain unconfigured; existing attributed widgets remain display-only. No source prices, gaps or timestamps have been synthesized.

## Final measured outcome

The final configuration completed 60 five-second samples: 2,160/2,160 eligible observations fresh (100%), with no exclusions, quota events or unhealthy process/API samples. Source switching was four changes in the five-minute final window versus four in the three-minute baseline; normalised rates were 0.814 versus 1.371 changes/minute. HTTP request rates were 86.45 versus 94.63/minute. These are provisional short windows, not sustained-capacity or 24-hour claims. The complete results, intermediate failures and per-provider counters are in [RELIABILITY-RESULTS.md](RELIABILITY-RESULTS.md).

The active clean run is `work/reliability/acceptance-v5`, started 1 November 2026 at 08:06:21 UTC (10:06:21 SAST), due 2 November at the same time. The original endurance monitor remains running, and all earlier trial evidence is retained. No completed clean 24-hour pass is claimed.
