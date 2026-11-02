import test from "node:test";
import assert from "node:assert/strict";
import {
  coreMarkets,
  isCoreNative,
  widgetRestricted,
} from "../lib/core-markets";
import { embeddedSelection } from "../lib/embedded-markets";
import { nativeAnalysisAllowed } from "../lib/native-policy";
import { demoQuotes, mergeObservations } from "../lib/market";
import { normaliseNews } from "../lib/content-adapters";

test("40 distinct launch instruments preserve category counts, USD and contract identity", () => {
  assert.equal(coreMarkets.length, 40);
  assert.equal(new Set(coreMarkets.map((i) => i.id)).size, 40);
  assert.deepEqual(
    Object.fromEntries(
      [
        "Crypto",
        "Forex",
        "Commodities",
        "Indices",
        "Stocks",
        "ETFs",
        "CFDs",
      ].map((c) => [c, coreMarkets.filter((i) => i.category === c).length]),
    ),
    {
      Crypto: 8,
      Forex: 8,
      Commodities: 6,
      Indices: 6,
      Stocks: 6,
      ETFs: 4,
      CFDs: 2,
    },
  );
  assert.ok(
    coreMarkets
      .filter((i) => i.category === "Crypto")
      .every((i) => i.id.endsWith("/USD")),
  );
  assert.equal(
    isCoreNative({ instrumentId: "BTC/USDT", status: "realtime" }),
    false,
  );
  assert.equal(
    isCoreNative({ instrumentId: "BTC/USD", status: "demonstration" }),
    false,
  );
  assert.equal(embeddedSelection().length, 40);
  assert.deepEqual(
    coreMarkets.filter((i) => i.category === "Commodities").map((i) => i.id),
    [
      "XAU/USD",
      "XAG/USD",
      "BIQUOTE:USOIL",
      "BIQUOTE:UKOIL",
      "BIQUOTE:XNGUSD",
      "BIQUOTE:XCUUSD",
    ],
  );
  assert.ok(!coreMarkets.some((i) => i.id.endsWith("-FUTURES")));
  assert.ok(
    embeddedSelection("Commodities", "", false).some(
      (i) => i.symbol === "COMEX:GC1!" && i.kind === "continuous futures",
    ),
  );
  assert.ok(embeddedSelection("All markets", "", false).length > 40);
  for (const c of coreMarkets)
    assert.equal(
      embeddedSelection(c.category).find((i) => i.symbol === c.widget)
        ?.category,
      c.category,
    );
  assert.ok(
    coreMarkets
      .filter((i) => i.category === "Commodities")
      .every(
        (i) =>
          i.product.includes("spot metal reference") ||
          i.product.includes(
            "Biquote broker-derived indicative commodity reference",
          ),
      ),
  );
  assert.ok(
    coreMarkets
      .filter((i) => i.category === "CFDs")
      .every((i) => i.id.startsWith("OANDA:")),
  );
  assert.equal(coreMarkets.filter((i) => widgetRestricted(i.widget)).length, 4);
  assert.equal(widgetRestricted("OANDA:SPX500USD"), false);
});

test("outage yields unavailable prices and policy blocks demo, stale, delayed and short history", () => {
  assert.deepEqual(mergeObservations([]).quotes, []);
  const q = demoQuotes()[0];
  assert.equal(nativeAnalysisAllowed(q, 26), false);
  const now = Date.now();
  const real = {
    ...q,
    provider: "coinbase",
    status: "realtime" as const,
    timestampKind: "exchange" as const,
    asOf: new Date(now).toISOString(),
  };
  const oldScope = process.env.MARKET_DATA_SCOPE;
  const oldUrl = process.env.APP_URL;
  process.env.MARKET_DATA_SCOPE = "local";
  process.env.APP_URL = "http://localhost:3100";
  try {
    assert.equal(nativeAnalysisAllowed(real, 26, now), true);
    assert.equal(
      nativeAnalysisAllowed(
        { ...real, asOf: new Date(now - 60001).toISOString() },
        26,
        now,
      ),
      false,
    );
    assert.equal(
      nativeAnalysisAllowed({ ...real, status: "delayed" }, 26, now),
      false,
    );
    assert.equal(
      nativeAnalysisAllowed({ ...real, history: [] }, 26, now),
      false,
    );
    process.env.MARKET_DATA_SCOPE = "commercial";
    assert.equal(nativeAnalysisAllowed(real, 26, now), false);
  } finally {
    if (oldScope === undefined) delete process.env.MARKET_DATA_SCOPE;
    else process.env.MARKET_DATA_SCOPE = oldScope;
    if (oldUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = oldUrl;
  }
});

test("publisher duplicates collapse while independent corroboration and later releases remain", () => {
  const row = {
    id: "1",
    title: "Fed releases outlook",
    summary: "Release",
    source: "Publisher",
    url: "https://news.example/one",
    publishedAt: "2026-11-01T08:00:00Z",
    category: "Forex",
    symbols: [],
  };
  const rows = normaliseNews(
    [
      row,
      { ...row, id: "2", url: "https://news.example/two?utm_source=test" },
      {
        ...row,
        id: "3",
        source: "Independent",
        url: "https://other.example/one",
      },
      {
        ...row,
        id: "4",
        url: "https://news.example/next",
        publishedAt: "2026-11-02T08:00:00Z",
      },
    ],
    "licensed",
    "Forex",
    Date.parse("2026-11-02T10:00:00Z"),
  );
  assert.equal(rows.length, 3);
});
