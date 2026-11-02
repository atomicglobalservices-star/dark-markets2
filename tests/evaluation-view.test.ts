import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluationDiagnostics,
  nativeUnavailableReason,
} from "../lib/evaluation-diagnostics";
import { coreMarkets } from "../lib/core-markets";
import {
  GoldApiAdapter,
  BiquoteAdapter,
  biquoteInspectionSymbols,
  normaliseBiquote,
} from "../lib/feeds/additional-providers";
import { Transport } from "../lib/feeds/transport";

test("an empty NAS100 response preserves other closed index references and DE30 keeps Germany 30 identity", async () => {
  const now = Date.parse("2026-11-01T12:00:00Z"),
    time = "2026-10-30T20:00:00Z";
  const symbols = ["US500", "NAS100", "US30", "UK100", "DE30", "JP225"];
  const catalog = symbols.map((name) => ({
    name,
    description: name === "DE30" ? "Germany 30 Index" : name,
    source: "Test Broker 1",
    exchange: "INDEX",
    type: "Index",
    currency: "USD",
    contractSize: 1,
    tickSize: 0.01,
    digits: 2,
  }));
  const raw = Object.fromEntries(
    symbols
      .filter((s) => s !== "NAS100")
      .map((symbol) => [
        symbol,
        {
          symbol,
          source: "Test Broker 1",
          exchange: "INDEX",
          bid: 100,
          ask: 102,
          mid: 101,
          timestamp: time,
          lastQuoteAt: time,
          marketState: "closed",
          stale: true,
        },
      ]),
  );
  const adapter = new BiquoteAdapter(
    new Transport(
      async () => Response.json(raw),
      () => now,
      20,
    ),
    () => now,
  );
  const quotes = await adapter.inspectionQuotes(catalog);
  assert.ok(biquoteInspectionSymbols.includes("NAS100"));
  assert.deepEqual(
    new Set(quotes.map((q) => q.providerSymbol)),
    new Set(symbols.filter((s) => s !== "NAS100")),
  );
  for (const q of quotes) {
    assert.equal(q.price, 101);
    assert.equal(q.asOf, time);
    assert.equal(q.marketState, "closed");
    assert.equal(q.quoteCurrency, "USD");
    assert.equal(q.publicDisplayEnabled, false);
    assert.equal(q.analysisAllowed, false);
    assert.equal(q.exportAllowed, false);
  }
  assert.match(
    quotes.find((q) => q.providerSymbol === "DE30")!.product,
    /Germany 30/,
  );
  assert.ok(
    !quotes
      .find((q) => q.providerSymbol === "DE30")!
      .product.includes("DAX 40"),
  );
});

test("six stock observations remain broker references when catalogue venue conflicts with NASDAQ and ticks omit the venue", async () => {
  const now = Date.parse("2026-11-01T12:00:00Z"),
    time = "2026-10-30T19:44:33Z";
  const symbols = ["AAPL", "NVDA", "MSFT", "AMZN", "GOOGL", "TSLA"];
  const catalog = symbols.map((name) => ({
    name,
    description: name,
    source: "Test Broker 1",
    exchange: "NYSE",
    type: "Stock",
    currency: "USD",
    contractSize: 1,
    tickSize: 0.00001,
    digits: 5,
  }));
  const raw = Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      {
        symbol,
        source: "Test Broker 1",
        exchange: null,
        bid: 100,
        ask: 102,
        mid: 101,
        timestamp: time,
        lastQuoteAt: time,
        marketState: "closed",
        stale: true,
      },
    ]),
  );
  const adapter = new BiquoteAdapter(
    new Transport(
      async () => Response.json(raw),
      () => now,
      20,
    ),
    () => now,
  );
  const quotes = await adapter.inspectionQuotes(catalog);
  assert.deepEqual(
    new Set(quotes.map((q) => q.providerSymbol)),
    new Set(symbols),
  );
  for (const q of quotes) {
    assert.equal(q.price, 101);
    assert.equal(q.asOf, time);
    assert.equal(q.marketState, "closed");
    assert.equal(q.exchange, null);
    assert.equal(q.quoteCurrency, "USD");
    assert.match(q.warning, /exchange NYSE/);
    assert.match(q.product, /exact contract and listing unverified/);
    assert.match(q.unit, /Unverified/);
    assert.equal(q.publicDisplayEnabled, false);
    assert.equal(q.analysisAllowed, false);
    assert.equal(q.exportAllowed, false);
  }
  const mismatch = { ...raw, AAPL: { ...raw.AAPL, symbol: "MSFT" } };
  const invalid = new BiquoteAdapter(
    new Transport(
      async () => Response.json(mismatch),
      () => now,
      20,
    ),
    () => now,
  );
  assert.ok(
    !(await invalid.inspectionQuotes(catalog)).some(
      (q) => q.providerSymbol === "AAPL",
    ),
  );
});

test("four Biquote commodity identifiers retain closed raw midpoints, unknown units and exact source identity", async () => {
  const now = Date.parse("2026-11-01T12:00:00Z"),
    asOf = "2026-10-30T20:00:00Z";
  const symbols = ["USOIL", "UKOIL", "XNGUSD", "XCUUSD"];
  const catalog = symbols.map((name) => ({
    name,
    description: name,
    source: "Test Broker 1",
    exchange: "OTC",
    type: "Commodity",
    currency: "USD",
    contractSize: 1,
    tickSize: 0.01,
    digits: 2,
  }));
  const raw = Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      {
        symbol,
        source: "Test Broker 1",
        exchange: "OTC",
        bid: 100,
        ask: 102,
        mid: 101,
        timestamp: asOf,
        lastQuoteAt: asOf,
        marketState: "closed",
        stale: true,
      },
    ]),
  );
  const adapter = new BiquoteAdapter(
    new Transport(
      async () => Response.json(raw),
      () => now,
      20,
    ),
    () => now,
  );
  const quotes = await adapter.inspectionQuotes(catalog);
  assert.deepEqual(
    quotes.map((q) => q.providerSymbol),
    symbols,
  );
  for (const q of quotes) {
    assert.equal(q.price, 101);
    assert.equal(q.asOf, asOf);
    assert.equal(q.quoteCurrency, "USD");
    assert.equal(q.marketState, "closed");
    assert.match(q.unit, /Unverified/);
    assert.equal(q.publicDisplayEnabled, false);
    assert.equal(q.analysisAllowed, false);
    assert.equal(q.exportAllowed, false);
    assert.ok(q.id.startsWith(`biquote:${q.providerSymbol}:`));
  }
  const bad = { ...raw, USOIL: { ...raw.USOIL, symbol: "WTICOUSD" } };
  const mismatched = new BiquoteAdapter(
    new Transport(
      async () => Response.json(bad),
      () => now,
      20,
    ),
    () => now,
  );
  assert.deepEqual(
    (await mismatched.inspectionQuotes(catalog)).map((q) => q.providerSymbol),
    symbols.slice(1),
  );
});

test("normal directory diagnostics explain exact-instrument, broker and rights gaps without substituting products", () => {
  assert.match(
    nativeUnavailableReason("XAU/USD"),
    /Spot references.*not substitutes/,
  );
  assert.match(nativeUnavailableReason("SPX/INDEX"), /official cash-index/);
  assert.match(
    nativeUnavailableReason("OANDA:XAUUSD"),
    /not verified as OANDA/,
  );
  assert.match(nativeUnavailableReason("EUR/USD"), /display conditions/);
  const native = coreMarkets
    .filter((c) => c.category === "Crypto")
    .map((c) => c.id);
  const rows = evaluationDiagnostics([], [], native);
  assert.equal(rows.length, 32);
  assert.ok(
    rows.every(
      (r) =>
        r.reasons.some((s) => s.includes("disabled")) &&
        r.reasons.some((s) => s.includes("not approved")),
    ),
  );
  assert.ok(
    rows
      .find((r) => r.id === "GLD/USD")!
      .reasons.some((s) => s.includes("No cached provider response")),
  );
});
test("closed and stale candidates explain visibility without approving subscriber prices", () => {
  const asOf = "2026-10-30T20:00:00Z";
  const q = normaliseBiquote(
    {
      symbol: "EURUSD",
      source: "Broker 1",
      exchange: "FOREX",
      bid: 1.1,
      ask: 1.1002,
      mid: 1.1001,
      timestamp: asOf,
      lastQuoteAt: asOf,
      marketState: "closed",
      stale: true,
    },
    {
      name: "EURUSD",
      description: "Euro",
      source: "Broker 1",
      exchange: "FOREX",
      type: "Forex",
      currency: "USD",
      contractSize: 1,
      tickSize: 0.0001,
      digits: 4,
    },
    "2026-11-01T12:00:00Z",
    1,
  );
  const d = evaluationDiagnostics([q], []).find((i) => i.id === "EUR/USD")!;
  assert.deepEqual(d.candidates, ["biquote:EURUSD"]);
  assert.ok(d.reasons.some((s) => s.includes("stale")));
  assert.ok(d.reasons.some((s) => s.includes("last-session")));
  assert.equal(q.publicDisplayEnabled, false);
});
test("copper is inspectable as an unverified observed value while the strict quote adapter still rejects it", async () => {
  const now = Date.parse("2026-11-01T12:00:00Z"),
    raw = {
      symbol: "HG",
      name: "Copper",
      currency: "USD",
      price: 6.5,
      updatedAt: new Date(now).toISOString(),
    };
  const adapter = new GoldApiAdapter(
    new Transport(
      async () => Response.json(raw),
      () => now,
      8,
    ),
    () => now,
    async () => {},
  );
  await assert.rejects(() => adapter.quote("HG"));
  const q = await adapter.inspectionQuote("HG");
  assert.equal(q.price, 6.5);
  assert.equal(q.priceType, "unverified-reference");
  assert.match(q.unit, /Unverified/);
  assert.equal(q.publicDisplayEnabled, false);
  assert.equal(q.analysisAllowed, false);
  assert.equal(q.exportAllowed, false);
});
test("inspection preserves nullable broker exchange and ambiguous USDT identity; a partial batch retains valid rows", async () => {
  const now = Date.parse("2026-11-01T12:00:00Z");
  const meta = {
    name: "SPYUSDT",
    description: "ETF-labelled broker product",
    source: "aggr",
    exchange: "stocks",
    type: "Stock",
    currency: "USD",
    contractSize: 1,
    tickSize: 0.01,
    digits: 2,
  };
  const raw = {
    SPYUSDT: {
      symbol: "SPYUSDT",
      source: "aggr",
      exchange: null,
      bid: 700,
      ask: 702,
      mid: 701,
      timestamp: new Date(now).toISOString(),
      lastQuoteAt: new Date(now).toISOString(),
      marketState: "open",
      stale: false,
    },
  };
  const adapter = new BiquoteAdapter(
    new Transport(
      async () => Response.json(raw),
      () => now,
      20,
    ),
    () => now,
  );
  const [q] = await adapter.inspectionQuotes([meta]);
  assert.equal(q.exchange, null);
  assert.match(q.quoteCurrency, /Unverified/);
  assert.match(q.product, /not an official stock/);
  assert.equal(q.price, 701);
  assert.equal(q.publicDisplayEnabled, false);
  assert.ok(biquoteInspectionSymbols.includes("XAGUSD"));
  assert.equal(biquoteInspectionSymbols.length, 28);
});
