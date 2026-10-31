# Deployment and operations

## Prepare

Use a Node.js 24 host, managed PostgreSQL 17, an HTTPS origin and a separate worker process. This stack is intentionally portable; it has not been changed to the Cloudflare Worker/D1 architecture used by Sites hosting. A deployment needs a separate explicit approval.

Set runtime secrets from `.env.example` in the host's secret manager. Use a unique database password, TLS to the database, a verified SMTP sender and exact HTTPS `APP_URL`. The origin check rejects cross-origin writes. Configure any reverse proxy to preserve the correct host and restrict the upstream port. Cookie security follows the HTTPS application URL.

Build and run:

```sh
npm ci
npm run db:generate
npm run typecheck
npm test
npm run build
npm run db:migrate
npm run db:seed
npm run start
# separate service
npm run worker
```

All npm scripts are portable and use relative paths. Do not use the local sample DB password, publicly expose Mailpit, or deploy unreviewed legal drafts. Supply a restrictive CSP nonce strategy before adding third-party scripts; the current Next.js CSP permits inline hydration scripts and styles. Review rate limits and add a trusted-edge IP limiter/CAPTCHA for registration abuse, production monitoring and MFA for administrator accounts.

## Market provider

`MARKET_PROVIDER=demo` is safe without credentials. Synthetic observations are timestamped and labelled; they are never claimed as live.

`MARKET_PROVIDER=licensed` enables a server-only normalised HTTP adapter. Set `MARKET_API_URL`, `MARKET_API_KEY` and `MARKET_COMMERCIAL_RIGHTS=true` only after obtaining commercial display/redistribution rights. The endpoint must return an array of:

```json
[
  {
    "symbol": "BTC",
    "name": "Bitcoin",
    "category": "Crypto",
    "price": 67432.8,
    "change": 2.84,
    "volume": 1000000,
    "volumeRatio": 1.2,
    "volatility": 1.1,
    "history": [{ "time": "2026-10-30T20:00:00.000Z", "price": 67432.8 }],
    "source": "Licensed provider name",
    "asOf": "2026-10-30T20:00:00.000Z",
    "status": "delayed",
    "exchangeTimezone": "UTC",
    "session": "24/7"
  }
]
```

The abbreviated example needs at least **26 historical observations** for Premium MACD (15 for standard calculations). The current symbol allowlist is in `lib/market.ts`; extend it with licensed instrument mappings. Forex prices are quote-currency rates, not uniform USD asset prices. Session labels and exchange timezones come from the provider. The adapter validates data, caches for 30 seconds, retries transient failures, avoids retry storms on HTTP 429, rejects timestamps older than 15 minutes/future timestamps and visibly falls back to demo. Adjust freshness policies per asset/session before using end-of-day or weekend data. Charts poll every minute; this is not an exchange-grade streaming terminal. Each group can be backed by a separate vendor behind the normalisation endpoint; vendor-specific adapters/licensing must be added for production. No restricted site scraping is used.

Public users can explore fixtures. Licensed `/api/markets` requires an active verified subscription. News and calendar use educational fixtures by default. Generic licensed JSON adapters and scheduled ingestion store snapshots in PostgreSQL. Set NEWS_PROVIDER or CALENDAR_PROVIDER to licensed, the matching API_URL/API_KEY and COMMERCIAL_RIGHTS=true. News items require id, category, title, summary, symbols[], source, https url, ISO publishedAt. Calendar items require id, time (HH:mm UTC), region, title, impact (High/Medium/Low), date (YYYY-MM-DD), source, https url. Only ingest text you are authorised to redistribute. Snapshots older than 15 minutes visibly fall back to fixtures. No article scraping or copyrighted full-text copying is implemented. News-rule alerts fire once on a related supplied story; economic-event rules use the selected event and threshold hours.

## AI

`AI_PROVIDER=deterministic` produces calculated factual briefings with no LLM. To enable interpretation use `AI_PROVIDER=openai-compatible`, `AI_API_KEY`, `AI_BASE_URL` and `AI_MODEL`. Keys stay server-side. Only market observations and the research question go to the provider. Never include private personal details in research questions. Numeric outputs come from application calculations; the interpretation validator rejects digits and recommendation keywords. This is a conservative first-line validator, not a semantic guarantee. Failed provider calls return an error and are retried by scheduled jobs; on-demand users can retry later. Failed on-demand attempts count toward usage limits to bound costs. Add provider-specific moderation, cost accounting and broader evidence-quality evaluation before launch.

## Billing

The default `BILLING_MODE=test` activates only local simulated subscriptions and simulated invoice records. It has no card collection or financial charges. Disable or replace this mode for production.

Use Stripe **test keys** first. Set `BILLING_MODE=stripe`, the secret key, webhook secret and monthly Standard/Premium price IDs. Configure Checkout and the billing portal for plan changes, cancellation and invoices. Forward Stripe events to `/api/billing/webhook`: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`. Verify the Stripe test-mode journey before any launch. Webhooks validate signatures and store unique event IDs atomically. Access follows subscription state and paid-period expiry. Add stale-event ordering reconciliation and scheduled Stripe reconciliation before commercial launch. Receipts and proration follow the configured Stripe portal. No live Stripe credentials or live charges were activated in this build.

## Background work and email

Run one worker initially. Jobs are claimed with optimistic database locking and recover a stale five-minute lease. Failed jobs back off with persistent attempts/errors. A single report job can publish partial batches before a retry, so report batch deduplication remains a production hardening item. Email outbox entries retry with backoff. SMTP delivery is at least once; a crash after sending but before marking sent may duplicate an email. Alert in-app notifications use a transactional one-shot claim. Trial reminders are deduplicated in the database and emailed through the outbox. Multiple long-running workers require stronger lease renewal before scaling.

Production SMTP must enforce authenticated TLS according to your provider. Local Mailpit uses plaintext loopback only. Health endpoint: `/api/health` (DB liveness and provider modes); `/admin` shows job status and errors. Add external alerting, provider freshness metrics, latency/error tracking and centralised log retention. No credentials are logged.

## Backups and rollback

Back up PostgreSQL daily using the managed provider or `pg_dump --format=custom`; store encrypted copies outside the database host and test restoration monthly. On Windows, write backups to a protected directory on D: and copy off-device. Use `pg_restore` into a new database for verification. Take a backup before each migration. Roll back application versions only when compatible with the current schema; prefer forward corrective migrations. Never automatically drop customer tables. Account deletion cascades account-linked data, including queued emails; operational audit and payment-provider records have separate retention obligations.
