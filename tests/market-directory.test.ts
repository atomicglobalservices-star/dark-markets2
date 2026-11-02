import test from "node:test";
import assert from "node:assert/strict";
import { marketDirectory } from "../lib/market-directory";
import { demoQuotes } from "../lib/market";
import { directorySession } from "../lib/market-hours";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MarketDirectory from "../app/market-directory";
import type { ComponentProps } from "react";

const customerQuotes = (
  extra: Partial<ComponentProps<typeof MarketDirectory>>,
) =>
  renderToStaticMarkup(
    React.createElement(MarketDirectory, {
      quotes: [],
      category: "All markets",
      query: "",
      featured: true,
      sort: "directory",
      watch: [],
      onWatch: () => {},
      onNativeChart: () => {},
      onVisualChart: () => {},
      price: (n) => n.toFixed(2),
      change: () => null,
      trend: () => null,
      ...extra,
    }),
  );

test("customer quote rows retain closed prices and original timestamps without fabricating changes or trends", () => {
  const q = {
    ...demoQuotes()[0],
    instrumentId: "AAPL/USD",
    symbol: "AAPL",
    category: "Stocks",
    price: 123.45,
    status: "stale" as const,
    provider: "twelvedata",
    source: "Authorised share feed",
    asOf: "2026-10-30T20:00:00Z",
    session: "closed",
    history: [],
    change: null,
  };
  let changes = 0,
    trends = 0;
  const closed = customerQuotes({
    quotes: [q],
    category: "Stocks",
    change: () => {
      changes++;
      return null;
    },
    trend: () => {
      trends++;
      return null;
    },
  });
  assert.ok(closed.includes("123.45"));
  assert.ok(closed.includes(q.asOf));
  assert.ok(closed.includes("MARKET CLOSED"));
  assert.equal(changes, 0);
  assert.equal(trends, 0);
  assert.ok(!closed.includes(">LIVE<"));
  const stale = customerQuotes({
    quotes: [{ ...q, session: "open", status: "realtime" }],
    category: "Stocks",
  });
  assert.ok(stale.includes(">STALE<"));
  const live = customerQuotes({
    quotes: [
      {
        ...q,
        session: "open",
        status: "realtime",
        asOf: new Date().toISOString(),
      },
    ],
    category: "Stocks",
  });
  assert.ok(live.includes(">LIVE<"));
});

test("restricted broker observations cannot become customer prices when warning text is removed", () => {
  const observation = {
    provider: "biquote" as const,
    providerSymbol: "AAPL",
    marketState: "closed" as const,
    price: 987654.321,
    source: "Private broker debug source",
    publicDisplayEnabled: false as const,
    analysisAllowed: false as const,
    exportAllowed: false as const,
  };
  const html = customerQuotes({
    category: "Stocks",
    stockReferences: [
      observation as unknown as NonNullable<
        ComponentProps<typeof MarketDirectory>["stockReferences"]
      >[number],
    ],
  });
  assert.ok(!html.includes("987654"));
  assert.ok(!html.includes("Private broker debug source"));
  assert.ok(!html.includes("LOCAL EVALUATION"));
  assert.ok(!html.includes("commercial display permission"));
  assert.ok(html.includes("Visual chart"));
  assert.ok(html.includes("View price"));
  assert.equal((html.match(/data-chart-action=/g) || []).length, 6);
});

test("website-approved spot references remain attributed, indicative and separate from visual chart prices", () => {
  const spot = {
    providerSymbol: "XAU",
    price: 1234.56,
    quoteCurrency: "USD",
    unit: "USD per troy ounce",
    source: "Gold API",
    asOf: "2026-10-30T20:00:00Z",
    receivedAt: "2026-11-01T12:00:00Z",
    timestampKind: "provider-source-fetch" as const,
    latencyMs: 1,
    relatedWidget: "FX_IDC:XAUUSD",
    status: "stale" as const,
  };
  const html = customerQuotes({
    category: "Commodities",
    spotReferences: [spot],
  });
  assert.ok(html.includes("1234.56"));
  assert.ok(html.includes("Gold API"));
  assert.ok(html.includes(spot.asOf));
  assert.ok(html.includes("DATA DELAYED"));
  assert.ok(!html.includes(">LIVE<"));
  assert.ok(html.includes("per troy ounce"));
});

test("ETF rows reject tokenised products, CFDs, NAV and metal prices but retain exact closed listed-share observations", () => {
  const base = {
    ...demoQuotes()[0],
    instrumentId: "SPY/USD",
    symbol: "SPY",
    category: "ETFs",
    kind: "etf" as const,
    unit: "USD per share",
    quoteCurrency: "USD",
    source: "Unit-test share feed",
    provider: "twelvedata",
    status: "stale" as const,
    price: 123.45,
    asOf: "2026-10-30T20:00:00Z",
    session: "closed",
  };
  const original = marketDirectory([base], "ETFs").find(
    (r) => r.id === "SPY/USD",
  )!;
  assert.equal(original.quote?.price, 123.45);
  assert.equal(original.quote?.asOf, base.asOf);
  assert.equal(original.status, "MARKET CLOSED");
  for (const invalid of [
    { instrumentId: "SPYUSDT" },
    { instrumentId: "SPY/USDT" },
    { quoteCurrency: "USDT" },
    { kind: "cfd" as const },
    { unit: "USD per fund NAV unit" },
    { instrumentId: "XAU/USD" },
  ]) {
    const rows = marketDirectory([{ ...base, ...invalid }], "ETFs");
    assert.equal(rows.length, 4);
    assert.ok(rows.every((row) => row.quote === null));
  }
  assert.deepEqual(
    new Set(marketDirectory([], "ETFs").map((r) => r.id)),
    new Set(["SPY/USD", "QQQ/USD", "VTI/USD", "GLD/USD"]),
  );
  assert.ok(marketDirectory([], "ETFs").every((r) => r.chart === "visual"));
});

test("closed stock sessions retain valid cached prices, identity and time while open feeds retain freshness checks", () => {
  const base = {
    ...demoQuotes()[0],
    instrumentId: "AAPL/USD",
    symbol: "AAPL",
    category: "Stocks",
    provider: "twelvedata",
    source: "Unit-test authorised stock feed",
    status: "stale" as const,
    price: 123.456,
    asOf: "2026-10-30T20:00:00Z",
    session: "closed",
  };
  const closed = marketDirectory([base], "Stocks").find(
    (r) => r.id === base.instrumentId,
  )!;
  assert.equal(closed.status, "MARKET CLOSED");
  assert.equal(closed.quote?.price, 123.456);
  assert.equal(closed.quote?.asOf, base.asOf);
  assert.equal(closed.quote?.source, base.source);
  const oldOpen = marketDirectory(
    [{ ...base, session: "open", status: "realtime" }],
    "Stocks",
  ).find((r) => r.id === base.instrumentId)!;
  assert.equal(oldOpen.status, "STALE");
  assert.equal(oldOpen.quote?.price, base.price);
  const freshOpen = marketDirectory(
    [
      {
        ...base,
        session: "open",
        status: "realtime",
        asOf: new Date().toISOString(),
      },
    ],
    "Stocks",
  ).find((r) => r.id === base.instrumentId)!;
  assert.equal(freshOpen.status, "realtime");
  assert.equal(freshOpen.session, "MARKET OPEN");
  const unknown = directorySession(
    "CFDs",
    "OANDA:SPX500USD",
    Date.now(),
    "unknown",
  );
  assert.match(unknown, /unconfirmed/);
  for (const invalid of [
    { price: NaN },
    { price: 0 },
    { asOf: "invalid" },
    { instrumentId: "OANDA:AAPL" },
  ]) {
    const rows = marketDirectory([{ ...base, ...invalid }], "Stocks");
    assert.equal(rows.length, 6);
    assert.equal(rows.find((r) => r.id === base.instrumentId)?.quote, null);
  }
});

test("weekend labels use market timezones and do not assert a live session on reopening", () => {
  assert.match(
    directorySession(
      "Forex",
      "FX_IDC:EURUSD",
      Date.parse("2026-11-01T13:00:00Z"),
    ),
    /MARKET CLOSED.*weekend/,
  );
  assert.match(
    directorySession(
      "Forex",
      "FX_IDC:EURUSD",
      Date.parse("2026-11-01T23:00:00Z"),
    ),
    /unconfirmed/,
  );
  // US DST transition: Friday 17:00 EDT closes at 21:00 UTC.
  assert.match(
    directorySession(
      "Forex",
      "FX_IDC:EURUSD",
      Date.parse("2026-10-30T21:01:00Z"),
    ),
    /MARKET CLOSED/,
  );
  assert.match(
    directorySession(
      "Indices",
      "INDEX:NKY",
      Date.parse("2026-11-01T23:00:00Z"),
    ),
    /unconfirmed/,
  );
  assert.match(
    directorySession(
      "Stocks",
      "NASDAQ:AAPL",
      Date.parse("2026-11-01T13:00:00Z"),
    ),
    /MARKET CLOSED/,
  );
  assert.equal(
    directorySession(
      "Crypto",
      "KRAKEN:BTCUSD",
      Date.parse("2026-11-01T13:00:00Z"),
    ),
    "24/7 market",
  );
  assert.match(directorySession("CFDs", "OANDA:SPX500USD"), /unconfirmed/);
});

test("a last-known stale quote keeps its original price and timestamp in the directory", () => {
  const original = demoQuotes()[0];
  const q = {
    ...original,
    instrumentId: "BTC/USD",
    status: "stale" as const,
    asOf: "2026-10-30T20:00:00Z",
  };
  const row = marketDirectory([q], "Crypto").find((r) => r.id === "BTC/USD")!;
  assert.equal(row.quote?.price, q.price);
  assert.equal(row.quote?.asOf, q.asOf);
  assert.equal(row.status, "STALE");
  assert.equal(marketDirectory([], "Forex").length, 8);
});

test("every category is the same registry subset as All Markets even with no prices", () => {
  const all = marketDirectory([]);
  assert.equal(all.length, 40);
  for (const [category, count] of Object.entries({
    Crypto: 8,
    Forex: 8,
    Stocks: 6,
    Indices: 6,
    Commodities: 6,
    ETFs: 4,
    CFDs: 2,
  })) {
    const rows = marketDirectory([], category);
    assert.equal(rows.length, count);
    assert.deepEqual(
      rows.map((i) => i.id),
      all.filter((i) => i.category === category).map((i) => i.id),
    );
    assert.ok(rows.every((i) => i.quote === null && i.chartUrl));
  }
});

test("restricted symbols stay in category with exact external chart actions and honest unavailable states", () => {
  const commodities = marketDirectory([], "Commodities");
  assert.deepEqual(
    commodities.map((i) => i.symbol),
    [
      "FX_IDC:XAUUSD",
      "FX_IDC:XAGUSD",
      "OANDA:WTICOUSD",
      "OANDA:BCOUSD",
      "OANDA:NATGASUSD",
      "OANDA:XCUUSD",
    ],
  );
  assert.ok(
    commodities.every(
      (i) =>
        ["spot metal reference", "broker-specific commodity CFD"].includes(
          i.kind,
        ) &&
        i.chart === "visual" &&
        i.status.includes("Visual-only"),
    ),
  );
  for (const row of commodities)
    assert.equal(new URL(row.chartUrl).searchParams.get("symbol"), row.symbol);
  const indices = marketDirectory([], "Indices");
  assert.equal(indices.length, 6);
  assert.ok(indices.every((i) => i.kind === "cash index"));
  assert.equal(indices.filter((i) => i.chart === "external").length, 4);
  assert.equal(indices.filter((i) => i.chart === "visual").length, 2);
  assert.ok(
    !indices.some((i) => i.source === "FOREXCOM" || i.source === "OANDA"),
  );
});

test("a quote only enriches its exact identity and stale, delayed, missing or demo prices never change membership", () => {
  const fixture = demoQuotes()[0];
  for (const status of [
    "realtime",
    "delayed",
    "stale",
    "demonstration",
  ] as const) {
    const quote = { ...fixture, instrumentId: "BTC/USD", status };
    const rows = marketDirectory([quote]);
    assert.equal(rows.length, 40);
    const row = rows.find((i) => i.id === "BTC/USD")!;
    assert.equal(
      row.quote?.status,
      status === "demonstration" ? undefined : status,
    );
  }
  const wrongContract = {
    ...fixture,
    instrumentId: "GOLD-FUTURES",
    category: "Commodities",
    status: "realtime" as const,
  };
  assert.ok(
    marketDirectory([wrongContract], "Commodities").every(
      (i) => i.quote === null,
    ),
  );
  assert.equal(marketDirectory([], "Commodities", "Gold").length, 1);
  assert.equal(marketDirectory([], "Indices", "COMEX:GC1!").length, 0);
  for (const sort of ["gainers", "losers", "volume"])
    assert.equal(marketDirectory([], "Commodities", "", true, sort).length, 6);
});
