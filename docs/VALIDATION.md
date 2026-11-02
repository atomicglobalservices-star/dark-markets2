# Validation record

## Current local validation - 2 November 2026

Analysis Engine Phase 1: 138 unit tests, TypeScript and production build passed. The read-only central-cache audit verified eight featured crypto/USD instruments on 5m, 1h and 1d; other availability and strict gap/freshness limitations are documented in `technical-analysis-phase1.md`. No UI, feed or monitoring changes were made for Phase 1.

The configured GitHub repository `atomicglobalservices-star/dark-markets2` is now verified private; the earlier visibility blocker below is historical. Local secrets and runtime data remain excluded. No hosting deployment is authorised by a source-control push.

## Historical initial validation

Validated in the managed Linux workspace on 31 October 2026:

- `npm run build`: successful production build, 25 generated pages plus dynamic API.
- `npm run typecheck`: passed.
- `npm test`: 8 unit tests passed.
- `npm run test:integration`: 15 tests passed against the production HTTP server, PostgreSQL 17 and a local Mailpit SMTP catcher.
- Desktop browser: home, dashboard, pricing, registration and markets rendered without page errors or horizontal overflow at 1440px.
- Mobile browser: home, dashboard, registration and pricing checked at 390px without horizontal overflow.
- Signed-in Chromium journey passed: registration, SMTP verification, watchlist persistence, research generation, Premium comparison, customisation dialog/keyboard dismissal, profile update, local test checkout and account deletion. No browser errors.
- Dashboard chart dialog and category filtering exercised in Chromium.
- `docker compose config --quiet`: passed. PostgreSQL and Mailpit containers were run successfully; the full application container image was not built in this session.

The automated suite covers trial boundary/plan permissions, indicators, fallback data labelling, report numeric integrity, rejected AI numerical/recommendation output and provider failure. Integration checks cover registration, verification delivery and one-time consumption, account isolation, Premium comparisons/downloads, stored alerts and worker deduplication, profile preferences, CSRF/input rejection, trial expiry, authorised test checkout, signed Stripe webhook synchronization/idempotence, cancellation, request limits, data export, support storage, reset delivery/single use/session invalidation and cascading account deletion.

No real market, news, calendar, AI or payment-provider network calls were validated. Stripe signatures use local test events; local billing charges no money. GitHub publication was withheld because both candidate repositories are public; the available connector cannot change visibility and the supplied CLI credential is invalid. No deployment occurred. Windows setup and complete Docker app-image execution remain to be verified on the target machine.
