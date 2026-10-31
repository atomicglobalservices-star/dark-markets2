import { test } from "node:test";
import assert from "node:assert/strict";
import {
  entitlement,
  TRIAL_MS,
  changePercent,
  indicator,
  triggers,
} from "../lib/domain";
import { demoQuotes, market } from "../lib/market";
import { factualReport } from "../lib/reports";
const now = new Date("2026-10-31T00:00:00Z");
const u = {
  verified: true,
  plan: "PREMIUM",
  status: "trialing",
  trialEndsAt: new Date(now.getTime() + TRIAL_MS),
  subscriptionEndsAt: null,
};
test("trial expires at the exact boundary and requires email verification", () => {
  assert.equal(entitlement(u, true, now), true);
  assert.equal(entitlement(u, true, u.trialEndsAt), false);
  assert.equal(entitlement({ ...u, verified: false }, false, now), false);
});
test("Standard cannot use Premium and canceled access ends at the paid boundary", () => {
  assert.equal(entitlement({ ...u, plan: "STANDARD" }, true, now), false);
  assert.equal(
    entitlement(
      {
        ...u,
        status: "canceled",
        subscriptionEndsAt: new Date(now.getTime() + 1),
      },
      true,
      now,
    ),
    true,
  );
  assert.equal(
    entitlement(
      {
        ...u,
        status: "past_due",
        subscriptionEndsAt: new Date(now.getTime() + 1000),
      },
      false,
      now,
    ),
    false,
  );
});
test("indicators handle rising, flat and insufficient data", () => {
  assert.equal(changePercent(110, 100), 10);
  assert.equal(indicator(Array.from({ length: 15 }, (_, i) => i + 1)).rsi, 100);
  assert.equal(indicator(Array(15).fill(10)).rsi, 50);
  assert.throws(() => indicator([1, 2]));
  assert.throws(() => changePercent(4, 0));
});
test("thresholds cover prices, changes, volume and volatility", () => {
  const q = { price: 10, change: -5, volumeRatio: 2, volatility: 3 };
  for (const [kind, t] of [
    ["price_above", 10],
    ["price_below", 10],
    ["change", 5],
    ["volume", 2],
    ["volatility", 3],
  ] as const)
    assert.equal(triggers(kind, t, q), true);
  assert.equal(triggers("price_above", 11, q), false);
  assert.equal(triggers("unknown", 2, q), false);
});
test("report observations match sources exactly; numeric calculations never come from an LLM", () => {
  const quotes = demoQuotes();
  const r = factualReport(quotes);
  assert.equal(r.facts.length, quotes.length);
  assert.equal(r.facts[0].price, quotes[0].price);
  assert.equal(r.dataAsOf[0].timestamp, quotes[0].asOf);
  assert.match(r.interpretation, /synthetic/);
  assert.equal(r.calculations[0].rsi14, Number(quotes[0].rsi.toFixed(2)));
  assert.throws(() => factualReport([]));
});
test("unconfigured licensed provider degrades to labelled demo, with error", async () => {
  const old = process.env.MARKET_PROVIDER;
  process.env.MARKET_PROVIDER = "licensed";
  delete process.env.MARKET_API_KEY;
  const r = await market();
  assert.ok(r.error);
  assert.ok(r.quotes.every((q) => q.status === "demonstration"));
  process.env.MARKET_PROVIDER = old;
});

import { advancedIndicators, comparison } from "../lib/analytics";
test("advanced calculations handle flat data and comparisons start at zero", () => {
  const indicators = advancedIndicators(Array(30).fill(100));
  assert.equal(indicators.macd, 0);
  assert.equal(indicators.bollinger.upper, 100);
  assert.throws(() => advancedIndicators([1]));
  const [a, b] = demoQuotes();
  const c = comparison(a, b);
  assert.equal(c.series[0][a.symbol], 0);
  assert.equal(c.series[0][b.symbol], 0);
});
import { generateReport } from "../lib/reports";
test("AI interpretation rejects invented numerical prose and provider failure", async () => {
  const previous = {
    provider: process.env.AI_PROVIDER,
    key: process.env.AI_API_KEY,
    model: process.env.AI_MODEL,
    market: process.env.MARKET_PROVIDER,
  };
  const originalFetch = globalThis.fetch;
  process.env.AI_PROVIDER = "openai-compatible";
  process.env.AI_API_KEY = "local-unit-test-placeholder";
  process.env.AI_MODEL = "unit-test";
  process.env.MARKET_PROVIDER = "demo";
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: "Bitcoin gained 99 percent. Buy now." } },
          ],
        }),
        { status: 200 },
      );
    await assert.rejects(
      () => generateReport("Describe observations", ["BTC"]),
      /validation/,
    );
    globalThis.fetch = async () => new Response("{}", { status: 503 });
    await assert.rejects(
      () => generateReport("Describe observations", ["BTC"]),
      /unavailable/,
    );
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  "These synthetic observations show mixed market changes and cannot establish a cause.",
              },
            },
          ],
        }),
        { status: 200 },
      );
    const report = await generateReport("Describe observations", ["BTC"]);
    assert.equal(report.content.facts[0].price, 67432.8);
    assert.equal(report.provider, "openai-compatible");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of [
      ["AI_PROVIDER", previous.provider],
      ["AI_API_KEY", previous.key],
      ["AI_MODEL", previous.model],
      ["MARKET_PROVIDER", previous.market],
    ])
      if (value === undefined) delete process.env[key!];
      else process.env[key!] = value;
  }
});
