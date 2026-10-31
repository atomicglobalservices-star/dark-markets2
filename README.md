# DARK MARKETS

**One World. Every Market. Intelligent Information.** Powered by DARK SYSTEMS (PTY) LTD.

Runnable Next.js App Router / TypeScript application with PostgreSQL, Prisma, Tailwind, Recharts, secure email/password accounts, seven-day trials and server-enforced subscription permissions. DARK OS was not available: the charcoal/lime theme is provisional and centralised in `app/globals.css`. No DARK OS files are used or modified.

## Run locally on Windows

Use Node.js 24 LTS, Git and Docker Desktop with Linux containers. Clone your private repository into `D:\DARK-MARKETS`. This build is in the supplied `dark-markets2` checkout; it has not been published to a new GitHub repository because the supplied GitHub credential is invalid.

PowerShell:

```powershell
Set-Location D:\DARK-MARKETS
Copy-Item .env.example .env
npm ci
npm run db:generate
docker compose up -d db mail
npm run db:migrate
npm run db:seed
npm run dev
```

In a second terminal:

```powershell
Set-Location D:\DARK-MARKETS
npm run worker
```

Open http://localhost:3000. Local emails appear at http://localhost:8025. Register, open the verification email, and confirm it to start the full seven-day trial. There are **no default passwords or seeded user accounts**. The billing page explicitly authorises local test subscriptions; no real card or money is involved. Password-reset messages also arrive in Mailpit.

To run all services in containers:

```powershell
docker compose up --build -d
```

Docker volumes use Docker Desktop's disk image. In Docker Desktop Settings → Resources → Advanced, move the disk image to a dedicated folder on D: where supported. The Git checkout alone does not move Docker volumes. Keep it separate from `D:\DARK-OS`. `docker compose down` preserves data; adding `-v` deletes volumes.

## Checks

```powershell
npm run typecheck
npm test
npm run build
npm run start
# With the application, DB and Mailpit running in local test/demo mode:
npm run test:integration
```

The integration suite creates disposable accounts and tests HTTP authentication, local SMTP delivery, verification, password reset, data isolation, Premium permissions, trial expiry, research limits, Stripe signature/idempotence logic, local billing, account export/deletion and background alerts. Do not run it against a production database. `npm test` is independent of the database.

`npm run db:generate` uses Prisma's matching WASM schema tools and JavaScript generator. The generation request passes through a temporary ignored file because some managed runtimes close child-process stdin pipes. No native query engine download is needed. `@prisma/internals` is pinned to match the Prisma client. Prisma uses its official PostgreSQL driver adapter.

`npm run db:migrate` runs checked-in SQL with transactions, a database advisory lock and Prisma-compatible migration history/checksums. `npm run db:migrate:prisma` is also available where Prisma's native schema engine can be downloaded. Never edit an applied migration; add a new migration directory.

## Structure

- `app/` — public pages, responsive terminal UI, REST handlers.
- `lib/auth.ts`, `domain.ts` — sessions, authorisation, rate limits and trial rules.
- `lib/market.ts`, `analytics.ts` — provider boundary, labelled fixtures and calculated indicators.
- `lib/reports.ts` — evidence-first reports and optional OpenAI-compatible AI provider.
- `lib/jobs.ts`, `scripts/worker.ts` — database-backed recurring jobs and retryable email outbox.
- `prisma/` — schema, migrations and safe seed data.
- `tests/` — unit and integration suites.

Grant an existing account administrator privileges locally:

```powershell
npx tsx --env-file=.env scripts/admin.ts operator@example.com
```

The command writes an audit record. Administrators use `/admin` to inspect accounts, plan counts, recurring revenue, jobs and support tickets. Test subscriptions are excluded from live MRR while billing is in test mode.

## What works

Public marketing, pricing ($10 Standard / $19 Premium), registration, hashed passwords, verification, password reset, hashed opaque session cookies, seven-day selected-plan trials, test checkout, cancellation, Stripe checkout/portal/webhook architecture, profile/data export/deletion, charted multi-asset fixtures, asset search and market movers, watchlists, threshold alerts, in-app notifications, retryable email alerts/reminders, saved reports, daily/weekly category briefings, Premium research (20 requests per 24-hour window), Premium comparisons/MACD/Bollinger calculations, persisted custom filters and widget ordering, and protected administration/support.

## Production integrations and remaining scope

This is a tested local development implementation, **not a completed commercial launch**. See [deployment instructions](docs/DEPLOYMENT.md) and [implementation status](docs/STATUS.md). Live market feeds, redistributed news/calendar content, a language-model account, production SMTP and Stripe require external credentials/rights and configuration. News/calendar use explicit educational fixtures by default; generic licensed JSON adapters, scheduled ingestion, persistent snapshots and news/event alerts are implemented but need authorised sources. Production cost metering, a richer administration console, observability, MFA and independent security/legal reviews remain. No live charges, external deployment or GitHub publication has occurred.
