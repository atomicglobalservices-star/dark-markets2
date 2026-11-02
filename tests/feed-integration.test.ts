import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { db } from "../lib/db";
import { engineFetch } from "../lib/feeds/client";
const base = process.env.APP_URL || "http://localhost:3100";
test("shared live engine and authenticated HTTP/SSE application boundary", async (t) => {
  assert.equal(
    process.env.MARKET_PROVIDER,
    "multi",
    "Run with local multi-provider mode enabled",
  );
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
  const email = `feed-test-${randomBytes(8).toString("hex")}@example.test`,
    password = randomBytes(24).toString("hex");
  const user = await db.user.create({
    data: {
      email,
      name: "Feed test",
      passwordHash: await hash(password, 12),
      verified: true,
      plan: "PREMIUM",
      trialEndsAt: new Date(Date.now() + 3600000),
    },
  });
  try {
    const login = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    await t.test(
      "expanded catalog and authorised multi-timeframe history",
      async () => {
        const catalog = await (
          await fetch(base + "/api/markets/instruments?q=platinum")
        ).json();
        assert.ok(catalog.instruments.some((i: any) => i.symbol === "XPT"));
        assert.equal(
          (
            await fetch(
              base + "/api/markets/history?instrument=BTC%2FUSDT&timeframe=1m",
            )
          ).status,
          401,
        );
        assert.equal(
          (
            await fetch(base + "/api/markets/health", {
              headers: { Cookie: cookie },
            })
          ).status,
          403,
        );
        for (const timeframe of ["1m", "5m", "1d"]) {
          const res = await fetch(
            base +
              "/api/markets/history?instrument=BTC%2FUSDT&timeframe=" +
              timeframe,
            { headers: { Cookie: cookie } },
          );
          assert.equal(res.status, 200);
          const data = await res.json();
          assert.equal(data.instrumentId, "BTC/USDT");
          assert.equal(data.quoteCurrency, "USDT");
          assert.equal(data.timeframe, timeframe);
          assert.ok(data.candles.length);
          assert.equal(data.provider, "binance");
        }
        assert.equal(
          (
            await fetch(
              base + "/api/markets/history?instrument=BTC%2FUSDT&timeframe=bad",
              { headers: { Cookie: cookie } },
            )
          ).status,
          400,
        );
      },
    );
    await t.test(
      "unauthenticated upstream and application streaming are denied",
      async () => {
        assert.equal(
          (
            await fetch(
              "http://127.0.0.1:" +
                (process.env.MARKET_ENGINE_PORT || "3110") +
                "/snapshot",
            )
          ).status,
          401,
        );
        assert.equal((await fetch(base + "/api/markets/stream")).status, 401);
        const anon = await (await fetch(base + "/api/markets")).json();
        assert.ok(anon.quotes.every((q: any) => q.status === "demonstration"));
      },
    );
    await t.test(
      "real connected prices carry pair, source, quote currency, timestamp and latency",
      async () => {
        const response = await fetch(base + "/api/markets", {
          headers: { Cookie: cookie },
        });
        assert.equal(response.status, 200);
        const data = await response.json();
        const usd = data.quotes.find((q: any) => q.instrumentId === "BTC/USD"),
          usdt = data.quotes.find((q: any) => q.instrumentId === "BTC/USDT");
        assert.ok(usd && usdt);
        assert.notEqual(usd.quoteCurrency, usdt.quoteCurrency);
        for (const q of [usd, usdt]) {
          assert.notEqual(q.status, "demonstration");
          assert.ok(q.price > 0);
          assert.ok(q.source);
          assert.ok(q.exchange);
          assert.ok(Number.isFinite(Date.parse(q.asOf)));
          assert.ok(q.latencyMs >= 0);
          assert.ok(q.candles.length >= 26);
          assert.equal(q.exportAllowed, false);
        }
        assert.ok(
          data.quotes.every((q: any) => q.status !== "demonstration"),
          "Unsupported markets never inherit demonstration prices",
        );
      },
    );
    await t.test(
      "two subscribers share the existing upstream socket and snapshot",
      async () => {
        const before = await (await engineFetch("/health")).json();
        const aborts = [new AbortController(), new AbortController()];
        const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
        try {
          for (const abort of aborts) {
            const res = await fetch(base + "/api/markets/stream", {
              headers: { Cookie: cookie },
              signal: abort.signal,
            });
            assert.equal(res.status, 200);
            assert.match(res.headers.get("content-type")!, /event-stream/);
            const reader = res.body!.getReader();
            readers.push(reader);
            const first = await reader.read();
            const text = new TextDecoder().decode(first.value);
            assert.match(text, /instrumentId/);
            assert.match(text, /quoteCurrency/);
          }
          const after = await (await engineFetch("/health")).json();
          assert.equal(after.stream, "connected");
          assert.equal(before.stream, "connected");
          assert.ok(after.subscribers >= 2);
        } finally {
          aborts.forEach((a) => a.abort());
          await Promise.allSettled(readers.map((r) => r.cancel()));
        }
      },
    );
    await t.test(
      "local feed content is excluded from report downloads and account export",
      async () => {
        const report = await db.report.create({
          data: {
            userId: user.id,
            title: "Local feed rights check",
            provider: "deterministic",
            content: {
              dataAsOf: [{ status: "realtime", exportAllowed: false }],
              facts: [{ price: 123 }],
            },
          },
        });
        assert.equal(
          (
            await fetch(base + "/api/reports/download?id=" + report.id, {
              headers: { Cookie: cookie },
            })
          ).status,
          403,
        );
        const exported = await (
          await fetch(base + "/api/account/export", {
            headers: { Cookie: cookie },
          })
        ).json();
        const saved = exported.reports.find((r: any) => r.id === report.id);
        assert.ok(saved.content.notice);
        assert.equal(saved.content.facts, undefined);
        const licensedNews = await db.report.create({
          data: {
            userId: user.id,
            title: "Content licence check",
            provider: "deterministic",
            content: {
              dataAsOf: [{ status: "demonstration" }],
              evidence: {
                news: {
                  status: "licensed",
                  exportAllowed: false,
                  items: [{ title: "Restricted licensed content" }],
                },
              },
            },
          },
        });
        assert.equal(
          (
            await fetch(base + "/api/reports/download?id=" + licensedNews.id, {
              headers: { Cookie: cookie },
            })
          ).status,
          403,
        );
      },
    );
  } finally {
    await db.user.deleteMany({ where: { id: user.id } });
    await db.$disconnect();
  }
});
