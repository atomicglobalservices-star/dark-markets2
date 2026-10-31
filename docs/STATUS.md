# Implementation status

## Implemented

- Independent Next.js App Router/TypeScript project, provisional DARK SYSTEMS tokens, Tailwind pipeline, responsive terminal and public site; no DARK OS changes.
- PostgreSQL/Prisma schema, transactional migrations, Docker Compose, portable scripts.
- Email/password registration, email verification, password reset, bcrypt hashing, opaque hashed session/reset tokens, secure-cookie settings, origin validation, server-side authorisation and persistent per-identity limits.
- Standard $10 and Premium $19; selected-plan no-card seven-day trial starts on first verification, exact server-side expiration, reminder/expiration jobs and cancellation.
- Local test checkout/invoices and Stripe SDK checkout, portal, signed/idempotent webhooks, subscription and payment-failure handling. Live integration still needs Stripe configuration and testing.
- Explicitly synthetic multi-market fixture adapter, historical charts, directory/category search, gainers/losers/volume sorting, freshness-aware normalised HTTP feed architecture, watchlists and calculated indicators.
- Daily/weekly global/category reports, evidence/calculation/source separation, deterministic local report adapter, optional server-side OpenAI-compatible interpretation.
- Premium research questions, limits, private research history/downloads, server-protected comparisons and MACD/Bollinger analytics, saved filters and widget ordering with keyboard alternative.
- Price/change/volume/volatility, asset-news and selected economic-event one-shot alerts, transactionally deduplicated in-app notifications, durable retryable email outbox.
- Account profile, support requests, export/deletion, protected admin counts/MRR/job/support/audit views.

## External setup or approval needed

- A private GitHub target: connected inspection confirmed both `atomicglobalservices-star/dark-markets` and the attached `dark-markets2` are public. The available connector cannot change repository visibility; the CLI credential is invalid. No source was pushed to either public repository. Make the target private before publication.
- DARK OS assets for exact brand parity.
- Licensed market, news and calendar sources; production SMTP; AI provider credentials.
- Stripe products/prices, test integration verification, tax/refund policies and separate approval for live charges.
- Hosting selection, secrets, deployment approval and operational/security/legal review.

## Remaining implementation before commercial launch

- Vendor-specific per-asset and content normalisers, exchange-calendar-specific freshness rules and broader instrument history. Generic licensed news/calendar JSON adapters, persistent snapshots and scheduled ingestion are implemented; no vendor credentials or redistribution rights are configured.
- Robust AI evidence validation/evaluation, token-level cost metering and per-provider budgets, scheduled weekly historical performance beyond the supplied fixture window.
- Subscription reconciliation and out-of-order webhook protection, real invoice retrieval, refund and tax handling policy.
- Richer admin views for cancellation/payment analytics, provider API cost/usage, published-report management, centralised logs and system monitoring.
- Robust long-job lease renewal, report-batch deduplication and deployment-level scheduled supervision; dead-letter UI for exhausted delivery attempts.
- MFA, edge/IP-based abuse prevention, production accessibility audit, full content legal review and penetration testing.

This source is a functioning local customer journey with test adapters. It is not represented as a finished production commercial service.
