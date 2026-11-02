import test from "node:test";
import assert from "node:assert/strict";
import {
  BiquoteAdapter,
  GoldApiAdapter,
  normaliseBiquote,
  normaliseGold,
  biquoteEvaluationSymbols,
  additionalFetcher,
  type BiquoteInstrument,
} from "../lib/feeds/additional-providers";
import {
  additionalConfig,
  refreshedEvaluationQuote,
} from "../lib/feeds/additional-collection";
import { Transport } from "../lib/feeds/transport";
const now = Date.parse("2026-11-01T12:00:00Z");
const meta: BiquoteInstrument = {
  name: "EURUSD",
  description: "Euro / US Dollar",
  source: "MetaTrader 5 (Broker 1)",
  exchange: "FOREX",
  type: "Forex",
  currency: "USD",
  contractSize: 100000,
  tickSize: 0.00001,
  digits: 5,
};
const tick = {
  symbol: "EURUSD",
  source: meta.source,
  exchange: meta.exchange,
  bid: 1.1,
  ask: 1.1002,
  mid: 1.1001,
  timestamp: new Date(now).toISOString(),
  lastQuoteAt: new Date(now).toISOString(),
  stale: false,
  marketState: "open",
};
test("documented 503 Retry-After survives provider transport and invalid receipt timing is rejected", async () => {
  const fetcher = additionalFetcher(
    async () =>
      new Response("{}", { status: 503, headers: { "Retry-After": "180" } }),
    () => now,
  );
  const transport = new Transport(fetcher, () => now, 20);
  await assert.rejects(
    () => transport.get("https://biquote.io/api/latest"),
    (e: any) => e.code === "unavailable" && e.retryMs === 180000,
  );
  assert.throws(() => normaliseBiquote(tick, meta, "invalid", 0));
  assert.throws(() =>
    normaliseBiquote(tick, meta, new Date(now).toISOString(), -1),
  );
});
test("Biquote historical bars retain unknown per-bar provenance, separate tick volume and exclude open bars", async () => {
  const bar = {
    openTime: new Date(now - 3600000).toISOString(),
    open: 1,
    high: 1.2,
    low: 0.9,
    close: 1.1,
    volume: 0,
    tickVolume: 100,
    isOpen: false,
  };
  let body: any = {
    symbol: "EURUSD",
    interval: "1h",
    bars: [
      { ...bar, isOpen: true, openTime: new Date(now).toISOString() },
      bar,
    ],
  };
  const adapter = new BiquoteAdapter(
    new Transport(
      async () => Response.json(body),
      () => now,
      20,
    ),
    () => now,
  );
  const result = await adapter.history(meta);
  assert.equal(result.bars.length, 1);
  assert.equal(result.bars[0].tickVolume, 100);
  assert.equal(result.bars[0].volume, 0);
  assert.equal(result.analysisAllowed, false);
  assert.match(result.provenance, /per-bar source not established/);
  body = { ...body, bars: [{ ...bar, high: 0.5 }] };
  const malformed = new BiquoteAdapter(
    new Transport(
      async () => Response.json(body),
      () => now,
      20,
    ),
    () => now,
  );
  await assert.rejects(() => malformed.history(meta));
});
test("Biquote is an attributed indicative midpoint, never an official index or OANDA contract", () => {
  const q = normaliseBiquote(tick, meta, new Date(now).toISOString(), 20);
  assert.equal(q.priceType, "indicative-midpoint");
  assert.equal(q.price, 1.1001);
  assert.equal(q.status, "indicative");
  assert.equal(q.analysisAllowed, false);
  assert.equal(q.publicDisplayEnabled, false);
  assert.match(q.id, /^biquote:/);
  assert.match(q.warning, /broker identity/);
  const changed = normaliseBiquote(
    tick,
    { ...meta, contractSize: 1 },
    new Date(now).toISOString(),
    20,
  );
  assert.notEqual(q.id, changed.id);
  assert.throws(() =>
    normaliseBiquote(
      { ...tick, symbol: "EURUSDT" },
      meta,
      new Date(now).toISOString(),
      0,
    ),
  );
  assert.throws(() =>
    normaliseBiquote(
      { ...tick, source: "Different broker" },
      meta,
      new Date(now).toISOString(),
      0,
    ),
  );
  assert.throws(() =>
    normaliseBiquote({ ...tick, ask: 1 }, meta, new Date(now).toISOString(), 0),
  );
  assert.throws(() =>
    normaliseBiquote({ ...tick, mid: 2 }, meta, new Date(now).toISOString(), 0),
  );
});
test("closed/weekend quotes preserve old source time and never renew trade freshness", () => {
  const old = new Date(now - 2 * 86400000).toISOString();
  const q = normaliseBiquote(
    {
      ...tick,
      timestamp: old,
      lastQuoteAt: old,
      marketState: "closed",
      stale: true,
    },
    meta,
    new Date(now).toISOString(),
    20,
  );
  assert.equal(q.status, "closed");
  assert.equal(q.stale, true);
  assert.equal(q.asOf, old);
  assert.equal(refreshedEvaluationQuote(q, now + 120000).status, "closed");
  const fresh = normaliseBiquote(tick, meta, new Date(now).toISOString(), 20);
  assert.equal(refreshedEvaluationQuote(fresh, now + 60001).status, "stale");
});
test("Gold API uses a spot reference and fetch time, rejects futures, wrong currency, missing timestamp and unknown copper units", () => {
  const raw = {
    symbol: "XAU",
    name: "Gold",
    currency: "USD",
    price: 3000,
    updatedAt: new Date(now).toISOString(),
  };
  const q = normaliseGold(raw, "XAU", new Date(now).toISOString(), 20);
  assert.equal(q.unit, "USD per troy ounce");
  assert.equal(q.marketState, "unknown");
  assert.equal(q.timestampKind, "provider-source-fetch");
  assert.equal(q.status, "indicative");
  assert.equal(q.exportAllowed, false);
  assert.notEqual(q.id, "GOLD-FUTURES");
  for (const bad of [
    { ...raw, currency: "EUR" },
    { ...raw, updatedAt: undefined },
    { ...raw, symbol: "GC1!" },
    { ...raw, price: NaN },
    { ...raw, updatedAt: new Date(now + 60000).toISOString() },
  ])
    assert.throws(() =>
      normaliseGold(bad, "XAU", new Date(now).toISOString(), 20),
    );
  assert.throws(() =>
    normaliseGold(
      { ...raw, symbol: "HG" },
      "HG",
      new Date(now).toISOString(),
      20,
    ),
  );
});
test("one batched Biquote request is shared by concurrent callers and rejects missing or mismatched results", async () => {
  const catalog = biquoteEvaluationSymbols.map((symbol) => ({
    ...meta,
    name: symbol,
    type:
      symbol === "US500"
        ? "Index"
        : symbol === "XAUUSD"
          ? "Commodity"
          : "Forex",
  }));
  const body = Object.fromEntries(
    catalog.map((i) => [i.name, { ...tick, symbol: i.name }]),
  );
  let calls = 0;
  let url = "";
  const adapter = new BiquoteAdapter(
    new Transport(
      async (u) => {
        calls++;
        url = String(u);
        return Response.json(body);
      },
      () => now,
      20,
    ),
    () => now,
  );
  const results = await Promise.all(
    Array.from({ length: 30 }, () => adapter.inspectionQuotes(catalog)),
  );
  assert.equal(calls, 1);
  assert.equal(results.length, 30);
  assert.equal(new URL(url).searchParams.getAll("symbols").length, 10);
  const bad = new BiquoteAdapter(
    new Transport(
      async () => Response.json({}),
      () => now,
      20,
    ),
    () => now,
  );
  assert.deepEqual(await bad.inspectionQuotes(catalog), []);
});
test("provider throttling, malformed data, outages and recovery retain existing Transport safeguards", async () => {
  let time = now,
    calls = 0;
  const transport = new Transport(
    async () => {
      calls++;
      return calls === 1
        ? new Response("{}", { status: 429, headers: { "Retry-After": "120" } })
        : Response.json({ ok: true });
    },
    () => time,
    20,
  );
  await assert.rejects(() => transport.get("https://biquote.io/api/latest"));
  await assert.rejects(() => transport.get("https://biquote.io/api/latest"));
  assert.equal(calls, 1);
  time += 120001;
  assert.deepEqual(await transport.get("https://biquote.io/api/latest"), {
    ok: true,
  });
  for (const response of [
    () => new Response("oops"),
    () => new Response("{}", { status: 503 }),
  ]) {
    const bad = new Transport(
      async () => response(),
      () => now,
      20,
    );
    await assert.rejects(() => bad.get("https://api.gold-api.com/symbols"));
  }
});
test("Gold calls are spaced, cached, and evaluation cannot activate on a public deployment", async () => {
  let time = now;
  const times: number[] = [];
  const adapter = new GoldApiAdapter(
    new Transport(
      async (u) => {
        times.push(time);
        return Response.json({
          symbol: String(u).includes("XAG") ? "XAG" : "XAU",
          name: "Metal",
          currency: "USD",
          price: 3000,
          updatedAt: new Date(time).toISOString(),
        });
      },
      () => time,
      8,
    ),
    () => time,
    async (ms) => {
      time += ms;
    },
  );
  await Promise.all([adapter.quote("XAU"), adapter.quote("XAG")]);
  assert.ok(times[1] - times[0] >= 1200);
  await adapter.quote("XAU");
  assert.equal(times.length, 2);
  assert.deepEqual(additionalConfig({}).enabled, []);
  assert.throws(() =>
    additionalConfig({
      APP_URL: "https://darktic.com",
      BIQUOTE_EVALUATION_ENABLED: "true",
    }),
  );
  assert.throws(() =>
    additionalConfig({
      APP_URL: "http://localhost:3100",
      MARKET_DATA_SCOPE: "commercial",
      GOLD_API_EVALUATION_ENABLED: "true",
    }),
  );
});
