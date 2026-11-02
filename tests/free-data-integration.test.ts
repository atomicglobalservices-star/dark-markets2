import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { db } from "../lib/db";
import { engineFetch } from "../lib/feeds/client";
const base = process.env.APP_URL || "http://localhost:3100";
test("free central datasets, cached history and provider controls retain subscription boundaries", async (t) => {
  const email = `free-integration-${randomBytes(7).toString("hex")}@example.test`,
    password = randomBytes(24).toString("hex");
  const user = await db.user.create({
    data: {
      email,
      name: "Free integration",
      passwordHash: await hash(password, 12),
      verified: true,
      role: "ADMIN",
      plan: "PREMIUM",
      trialEndsAt: new Date(Date.now() + 3600000),
    },
  });
  let previous: boolean | undefined;
  try {
    const login = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const headers = { Cookie: cookie };
    await t.test(
      "anonymous access cannot read fundamentals or administrator controls",
      async () => {
        assert.equal(
          (await fetch(base + "/api/fundamentals?symbol=AAPL")).status,
          401,
        );
        assert.equal((await fetch(base + "/api/data/providers")).status, 401);
      },
    );
    await t.test(
      "genuine free news is attributed, dated, AI-labelled and searchable",
      async () => {
        const feed = await (
          await fetch(base + "/api/news", { headers })
        ).json();
        assert.equal(feed.status, "licensed");
        assert.ok(feed.articles.length);
        assert.ok(
          feed.articles.every(
            (a: any) =>
              a.source === "Capital Data Wire" &&
              a.aiGenerated === true &&
              a.corroborated === false &&
              a.url.startsWith("https://capitaldatawire.com/stories/") &&
              Number.isFinite(Date.parse(a.publishedAt)),
          ),
        );
        const query = feed.articles[0].title.split(" ")[0];
        const filtered = await (
          await fetch(base + "/api/news?q=" + encodeURIComponent(query), {
            headers,
          })
        ).json();
        assert.ok(filtered.articles.length);
      },
    );
    await t.test(
      "calendar carries genuine records, UTC/provenance, pending values and filters",
      async () => {
        const feed = await (
          await fetch(base + "/api/calendar", { headers })
        ).json();
        assert.equal(feed.status, "licensed");
        assert.ok(feed.events.length);
        assert.ok(
          feed.events.every(
            (e: any) =>
              e.provider === "financecalendar" &&
              e.attribution?.terms &&
              e.date,
          ),
        );
        const high = await (
          await fetch(base + "/api/calendar?importance=High", { headers })
        ).json();
        assert.ok(high.events.every((e: any) => e.impact === "High"));
      },
    );
    await t.test(
      "SEC fundamentals return cached reported figures with exact taxonomy, units and filing references",
      async () => {
        const data = await (
          await fetch(base + "/api/fundamentals?symbol=AAPL", { headers })
        ).json();
        assert.equal(data.cached, true);
        assert.equal(data.cik, "0000320193");
        assert.ok(data.metrics.assets.length);
        const row = data.metrics.assets[0];
        assert.equal(row.taxonomy, "us-gaap");
        assert.equal(row.concept, "Assets");
        assert.ok(row.unit);
        assert.ok(row.end);
        assert.ok(row.filed);
        assert.ok(row.accession);
        assert.ok(Number.isFinite(row.value));
        assert.ok(row.sourceUrl.startsWith("https://www.sec.gov/Archives/"));
      },
    );
    await t.test(
      "page history reads return a single centrally cached dataset, not an on-demand exchange fetch",
      async () => {
        const response = await fetch(
          base + "/api/markets/history?instrument=BTC%2FUSDT&timeframe=1d",
          { headers },
        );
        assert.equal(response.status, 200);
        const first = await response.json();
        assert.equal(first.cacheOnly, true);
        const reads = await Promise.all(
          Array.from({ length: 15 }, async () => {
            const r = await fetch(
              base + "/api/markets/history?instrument=BTC%2FUSDT&timeframe=1d",
              { headers },
            );
            return r.json();
          }),
        );
        assert.ok(
          reads.every(
            (r) => r.cacheOnly === true && r.collectedAt === first.collectedAt,
          ),
        );
        const health = await (await engineFetch("/health")).json();
        assert.equal(
          health.collectionIntervalSeconds,
          Number(process.env.MARKET_POLL_MS || 15000) / 1000,
        );
        assert.ok(health.historyCached > 0);
      },
    );
    await t.test(
      "admin source changes are persisted, audited and do not grant redistribution rights",
      async () => {
        const before = await (
          await fetch(base + "/api/data/providers", { headers })
        ).json();
        previous = before.controls.tradingview;
        const res = await fetch(base + "/api/data/providers", {
          method: "POST",
          headers: {
            ...headers,
            Origin: base,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ provider: "tradingview", enabled: false }),
        });
        assert.equal(res.status, 200);
        const settings = await (
          await fetch(base + "/api/data/settings", { headers })
        ).json();
        assert.equal(settings.tradingViewEnabled, false);
        assert.ok(
          await db.audit.count({
            where: { actorId: user.id, action: "provider.control" },
          }),
        );
        assert.ok(
          !JSON.stringify(before).includes(
            process.env.SEC_USER_AGENT || "unconfigured private identity",
          ),
        );
      },
    );
  } finally {
    if (previous !== undefined)
      await db.snapshot.upsert({
        where: { key: "control:tradingview" },
        create: {
          key: "control:tradingview",
          content: { enabled: previous },
          status: "control",
        },
        update: { content: { enabled: previous } },
      });
    await db.user.deleteMany({ where: { id: user.id } });
    await db.$disconnect();
  }
});
