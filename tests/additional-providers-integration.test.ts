import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { db } from "../lib/db";
import {
  collectAdditionalMarkets,
  additionalSnapshots,
} from "../lib/feeds/additional-collection";
import { normaliseBiquote } from "../lib/feeds/additional-providers";
import { FeedError } from "../lib/feeds/types";
const isolated = /^\/dark_essential_test_\d+$/.test(
  new URL(process.env.DATABASE_URL || "postgres://localhost/unconfigured")
    .pathname,
);
test(
  "additional providers use durable central cache, fail closed and retain subscriber isolation",
  { skip: !isolated },
  async (t) => {
    const keys = ["evaluation:biquote", "evaluation:lease:biquote"];
    await db.snapshot.deleteMany({ where: { key: { in: keys } } });
    const config = { local: true, enabled: ["biquote" as const] };
    const asOf = new Date(Date.now() - 120000).toISOString();
    const quote = normaliseBiquote(
      {
        symbol: "EURUSD",
        source: "Test-only broker",
        exchange: "FOREX",
        bid: 1.1,
        ask: 1.1002,
        mid: 1.1001,
        timestamp: asOf,
        lastQuoteAt: asOf,
        stale: true,
        marketState: "open",
      },
      {
        name: "EURUSD",
        description: "Test fixture",
        source: "Test-only broker",
        exchange: "FOREX",
        type: "Forex",
        currency: "USD",
        contractSize: 100000,
        tickSize: 0.00001,
        digits: 5,
      },
      new Date().toISOString(),
      1,
    );
    let calls = 0;
    try {
      await t.test(
        "concurrent collectors admit one request and cache readers never collect",
        async () => {
          const results = await Promise.all(
            Array.from({ length: 30 }, () =>
              collectAdditionalMarkets(config, async () => {
                calls++;
                await new Promise((r) => setTimeout(r, 40));
                return [quote];
              }),
            ),
          );
          assert.equal(calls, 1);
          assert.equal(
            results.flat().filter((r) => r.state === "collected").length,
            1,
          );
          await Promise.all(
            Array.from({ length: 30 }, () => additionalSnapshots(config)),
          );
          assert.equal(calls, 1);
          const data = await additionalSnapshots(config);
          assert.equal(data.providers[0].quotes[0].asOf, asOf);
          assert.equal(data.providers[0].quotes[0].status, "stale");
          assert.equal(data.providers[0].quotes[0].analysisAllowed, false);
        },
      );
      await t.test(
        "429 opens durable circuit, honors Retry-After and preserves old timestamps",
        async () => {
          const old = await db.snapshot.findUniqueOrThrow({
            where: { key: keys[0] },
          });
          await db.snapshot.update({
            where: { key: keys[1] },
            data: { content: { nextAt: 0, failures: 0 } },
          });
          const start = Date.now();
          await collectAdditionalMarkets(config, async () => {
            throw new FeedError("rate-limit", 180000);
          });
          const lease = await db.snapshot.findUniqueOrThrow({
            where: { key: keys[1] },
          });
          assert.ok((lease.content as any).nextAt >= start + 180000);
          assert.equal((lease.content as any).state, "open");
          const failed = await db.snapshot.findUniqueOrThrow({
            where: { key: keys[0] },
          });
          assert.deepEqual(failed.content, old.content);
          assert.equal(
            failed.fetchedAt.toISOString(),
            old.fetchedAt.toISOString(),
          );
          assert.equal(failed.sourceError, "rate-limit");
          await collectAdditionalMarkets(config, async () => {
            calls++;
            return [quote];
          });
          assert.equal(calls, 1);
        },
      );
      await t.test(
        "an expired/replaced lease cannot overwrite newer state",
        async () => {
          await db.snapshot.update({
            where: { key: keys[1] },
            data: { content: { nextAt: 0, failures: 0 } },
          });
          let begin!: () => void, finish!: () => void;
          const started = new Promise<void>((r) => (begin = r)),
            release = new Promise<void>((r) => (finish = r));
          const collecting = collectAdditionalMarkets(config, async () => {
            begin();
            await release;
            return [quote];
          });
          await started;
          await db.snapshot.update({
            where: { key: keys[1] },
            data: {
              content: {
                owner: "replacement",
                nextAt: Date.now() + 120000,
                failures: 0,
              },
            },
          });
          finish();
          assert.equal((await collecting)[0].state, "lease-lost");
          assert.equal(
            (await db.snapshot.findUniqueOrThrow({ where: { key: keys[0] } }))
              .sourceError,
            "rate-limit",
          );
        },
      );
      await t.test(
        "local admin API is disabled by default; anonymous, subscriber and forwarded-public requests are denied",
        async () => {
          const password = randomBytes(20).toString("hex"),
            base = process.env.APP_URL!;
          const user = await db.user.create({
            data: {
              email: `providers-${randomBytes(7).toString("hex")}@example.test`,
              name: "Provider tests",
              passwordHash: await hash(password, 12),
              role: "ADMIN",
              verified: true,
              plan: "PREMIUM",
              trialEndsAt: new Date(Date.now() + 3600000),
            },
          });
          try {
            const login = await fetch(base + "/api/auth/login", {
              method: "POST",
              headers: { Origin: base, "Content-Type": "application/json" },
              body: JSON.stringify({ email: user.email, password }),
            });
            assert.equal(login.status, 200);
            const cookie = login.headers.get("set-cookie")!.split(";")[0];
            assert.equal(
              (await fetch(base + "/api/markets/provider-evaluation")).status,
              401,
            );
            const response = await fetch(
              base + "/api/markets/provider-evaluation",
              { headers: { Cookie: cookie } },
            );
            assert.equal(response.status, 200);
            const data = await response.json();
            assert.deepEqual(data.automaticCollectionEnabled, []);
            assert.equal(data.providers.length, 2);
            assert.equal(data.publicDisplayEnabled, false);
            assert.ok(data.providers[0].quotes.length > 0);
            assert.ok(
              data.providers
                .flatMap((p: any) => p.quotes)
                .every(
                  (q: any) =>
                    q.publicDisplayEnabled === false &&
                    q.analysisAllowed === false &&
                    q.exportAllowed === false,
                ),
            );
            for (const provider of ["biquote", "goldapi"]) {
              await db.snapshot.upsert({
                where: { key: "evaluation:lease:" + provider },
                create: {
                  key: "evaluation:lease:" + provider,
                  status: "lease",
                  content: { owner: "test", nextAt: Date.now() + 120000 },
                },
                update: {
                  content: { owner: "test", nextAt: Date.now() + 120000 },
                },
              });
            }
            const refresh = await fetch(
              base + "/api/markets/provider-evaluation",
              {
                method: "POST",
                headers: {
                  Cookie: cookie,
                  Origin: base,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ provider: "all" }),
              },
            );
            assert.equal(refresh.status, 200);
            const refreshed = await refresh.json();
            assert.ok(
              refreshed.refreshResults.every(
                (r: any) => r.state === "cached-or-circuit-open",
              ),
            );
            assert.deepEqual(refreshed.automaticCollectionEnabled, []);
            assert.equal(
              (
                await fetch(base + "/api/markets/provider-evaluation", {
                  method: "POST",
                  headers: {
                    Cookie: cookie,
                    Origin: "https://evil.test",
                    "Content-Type": "application/json",
                  },
                  body: "{}",
                })
              ).status,
              403,
            );
            assert.equal(
              (
                await fetch(base + "/api/markets/provider-evaluation", {
                  method: "POST",
                  headers: {
                    Cookie: cookie,
                    Origin: base,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ provider: "arbitrary-provider" }),
                })
              ).status,
              400,
            );
            assert.equal(
              (
                await fetch(base + "/api/markets/provider-evaluation", {
                  headers: {
                    Cookie: cookie,
                    "X-Forwarded-Host": "darktic.com",
                  },
                })
              ).status,
              403,
            );
            await db.user.update({
              where: { id: user.id },
              data: { role: "USER" },
            });
            assert.equal(
              (
                await fetch(base + "/api/markets/provider-evaluation", {
                  headers: { Cookie: cookie },
                })
              ).status,
              403,
            );
            const market = await (
              await fetch(base + "/api/markets", {
                headers: { Cookie: cookie },
              })
            ).json();
            assert.ok(
              market.quotes.every(
                (q: any) =>
                  q.provider !== "biquote" && q.provider !== "goldapi",
              ),
            );
          } finally {
            await db.user.delete({ where: { id: user.id } });
          }
        },
      );
    } finally {
      await db.$disconnect();
    }
  },
);
