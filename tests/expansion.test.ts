import { test } from "node:test";
import assert from "node:assert/strict";
import {
  instruments,
  resolveInstrument,
  catalogSearch,
  type Observation,
} from "../lib/feeds/types";
import { RestProvider } from "../lib/feeds/providers";
import { Transport } from "../lib/feeds/transport";
import {
  normaliseNews,
  normaliseCalendar,
  filterNews,
  filterCalendar,
} from "../lib/content-adapters";
import { factualReport } from "../lib/reports";
import { demoQuotes } from "../lib/market";
import { correlation } from "../lib/analytics";
const now = Date.parse("2026-11-01T00:00:00Z");
const response = (body: unknown) => new Response(JSON.stringify(body));
test("expanded registry has unique IDs/symbols, correct crypto aliases and exact quotation currencies", () => {
  assert.equal(new Set(instruments.map((i) => i.id)).size, instruments.length);
  assert.equal(
    new Set(instruments.map((i) => i.symbol)).size,
    instruments.length,
  );
  for (const base of [
    "BTC",
    "ETH",
    "SOL",
    "XRP",
    "BNB",
    "ADA",
    "DOGE",
    "LTC",
    "TRX",
    "AVAX",
  ])
    for (const currency of ["USD", "USDT", "EUR"])
      assert.equal(resolveInstrument(base + "/" + currency).quote, currency);
  assert.equal(resolveInstrument("DOGE").mappings.kraken, "XDGUSD");
  assert.equal(resolveInstrument("USDJPY").quote, "JPY");
  assert.equal(resolveInstrument("VOD:LSE").quote, "GBX");
});
test("indices, ETFs and commodities never masquerade as CFDs or interchangeable futures", () => {
  assert.equal(resolveInstrument("SPX").kind, "cash-index");
  assert.equal(resolveInstrument("SPY").kind, "etf");
  assert.equal(resolveInstrument("GLD").kind, "etf");
  assert.equal(resolveInstrument("WTI").kind, "futures");
  assert.equal(Object.keys(resolveInstrument("WTI").mappings).length, 0);
  assert.equal(resolveInstrument("XAU").unit, "USD per troy ounce");
  assert.equal(instruments.filter((i) => i.kind === "cfd").length, 0);
});
test("catalog searches names, venues, pairs, categories and quote currencies without inventing prices", () => {
  assert.ok(catalogSearch("JPY").length >= 2);
  assert.ok(catalogSearch("NASDAQ", "Stocks").length >= 5);
  assert.ok(catalogSearch("", "Crypto", "EUR").every((i) => i.quote === "EUR"));
  assert.ok(catalogSearch("platinum").length);
  assert.equal("price" in catalogSearch("platinum")[0], false);
});
test("exchange discovery rejects unsupported and currency-mismatched products", async () => {
  const p = new RestProvider(
    "binance",
    new Transport(
      async () =>
        response({
          symbols: [
            {
              symbol: "BTCUSDT",
              baseAsset: "BTC",
              quoteAsset: "USD",
              status: "TRADING",
            },
          ],
        }),
      () => now,
    ),
  );
  assert.equal(await p.supports(resolveInstrument("BTC/USDT")), false);
  const cb = new RestProvider(
    "coinbase",
    new Transport(
      async () =>
        response([
          {
            id: "BTC-USD",
            base_currency: "BTC",
            quote_currency: "USD",
            status: "online",
            trading_disabled: false,
          },
        ]),
      () => now,
    ),
  );
  assert.equal(await cb.supports(resolveInstrument("BTC")), true);
  assert.equal(await cb.supports(resolveInstrument("BNB")), false);
});
test("Binance timeframes use exact candle intervals and discard unfinished rows", async () => {
  const urls: string[] = [];
  const p = new RestProvider(
    "binance",
    new Transport(
      async (url) => {
        urls.push(String(url));
        return response([
          [now - 600000, "10", "12", "9", "11", "2", now - 300000],
          [now, "11", "13", "10", "12", "3", now + 300000],
        ]);
      },
      () => now,
    ),
    {},
    () => now,
  );
  const candles = await p.candles(resolveInstrument("BTC/USDT"), "5m");
  assert.equal(candles.length, 1);
  assert.equal(candles[0].open, 10);
  assert.match(urls[0], /interval=5m/);
  assert.match(urls[0], /limit=300/);
});
test("Coinbase daily candles retain provider OHLCV ordering and UTC", async () => {
  let endpoint = "";
  const p = new RestProvider(
    "coinbase",
    new Transport(
      async (url) => {
        endpoint = String(url);
        return response([[now / 1000 - 86400, 9, 12, 10, 11, 3]]);
      },
      () => now,
    ),
    {},
    () => now,
  );
  const [c] = await p.candles(resolveInstrument("BTC"), "1d");
  assert.match(endpoint, /granularity=86400/);
  assert.equal(c.low, 9);
  assert.equal(c.high, 12);
  assert.equal(c.open, 10);
  assert.equal(c.close, 11);
  assert.equal(c.volume, 3);
  assert.ok(c.time.endsWith("Z"));
});
test("Finnhub news keeps real publisher/timestamp, tags and deduplicates original URLs", () => {
  const row = {
    id: 1,
    datetime: now / 1000,
    headline: "Publisher headline",
    summary: "Publisher supplied summary",
    source: "Publisher",
    url: "https://publisher.test/news?a=1&utm_source=test",
    related: "AAPL,MSFT",
  };
  const rows = normaliseNews(
    [row, { ...row, id: 2, url: "https://publisher.test/news?a=1" }],
    "finnhub",
    "general",
    now,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, "Publisher");
  assert.deepEqual(rows[0].symbols, ["AAPL", "MSFT"]);
  assert.equal(rows[0].breaking, false);
  assert.equal(filterNews(rows, "publisher", "Stocks", "AAPL").length, 1);
});
test("news rejects absent attribution, unsafe URLs and future timestamps", () => {
  const row = {
    id: 1,
    datetime: now / 1000,
    headline: "Headline",
    source: "Publisher",
    url: "https://publisher.test/article",
  };
  assert.throws(() =>
    normaliseNews([{ ...row, source: "" }], "finnhub", "general", now),
  );
  assert.throws(() =>
    normaliseNews(
      [{ ...row, url: "javascript:alert(1)" }],
      "finnhub",
      "general",
      now,
    ),
  );
  assert.throws(() =>
    normaliseNews(
      [{ ...row, datetime: now / 1000 + 1000 }],
      "finnhub",
      "general",
      now,
    ),
  );
});
test("Trading Economics events preserve pending values, currency, units and tentative time", () => {
  const [e] = normaliseCalendar(
    [
      {
        CalendarId: 42,
        Date: "2026-11-02T12:30:00",
        Country: "United States",
        Currency: "USD",
        Event: "Employment report",
        Importance: 3,
        Source: "Official statistical agency",
        SourceURL: "https://agency.test/report",
        Previous: "100K",
        Forecast: "120K",
        Actual: null,
        Unit: "jobs",
        DateSpan: 1,
      },
    ],
    "tradingeconomics",
  );
  assert.equal(e.actual, null);
  assert.equal(e.previous, "100K");
  assert.equal(e.forecast, "120K");
  assert.equal(e.currency, "USD");
  assert.equal(e.tentative, true);
  assert.equal(e.impact, "High");
  assert.equal(filterCalendar([e], "United", "USD").length, 1);
  assert.equal(filterCalendar([e], "", "EUR").length, 0);
});
test("economic event schemas reject impossible dates and times", () => {
  const row = {
    id: "1",
    time: "25:90",
    region: "US",
    date: "2026-02-30",
    source: "Agency",
    url: "https://agency.test",
    title: "Release",
    impact: "High",
  };
  assert.throws(() => normaliseCalendar([row], "licensed"));
});
test("deterministic reports carry real calculations, limits, correlations and source evidence", () => {
  const quotes = demoQuotes().slice(0, 2);
  const report = factualReport(quotes);
  assert.equal(report.calculations[0].volume, quotes[0].volume);
  assert.equal(
    report.calculations[0].historicalReturn,
    (quotes[0].history.at(-1)!.price / quotes[0].history[0].price - 1) * 100,
  );
  assert.ok(report.limitations.length);
  assert.equal(report.correlations.length, 1);
  assert.equal(report.dataAsOf[0].quoteCurrency, "USD");
  assert.equal(correlation(quotes[0], quotes[0]), 1);
});

import { exchangeSchedule } from "../lib/feeds/schedule";
test("licensed venue schedules preserve local timezone, holiday closure and exact venue identity", async () => {
  const p = new Transport(
    async () =>
      response({
        data: [
          {
            name: "NASDAQ",
            code: "XNGS",
            time_zone: "America/New_York",
            sessions: [],
          },
        ],
      }),
    () => now,
  );
  const calendar = await exchangeSchedule(
    resolveInstrument("AAPL"),
    new Date(now),
    "mock",
    p,
  );
  assert.equal(calendar.schedules[0].sessions.length, 0);
  assert.equal(calendar.schedules[0].time_zone, "America/New_York");
  const wrong = new Transport(
    async () =>
      response({
        data: [
          {
            name: "NYSE",
            code: "XNYS",
            time_zone: "America/New_York",
            sessions: [],
          },
        ],
      }),
    () => now,
  );
  await assert.rejects(
    () =>
      exchangeSchedule(resolveInstrument("AAPL"), new Date(now), "mock", wrong),
    /Mismatched/,
  );
});
test("news and calendar require genuine upstream IDs, not undefined synthetic identities", () => {
  assert.throws(() =>
    normaliseNews(
      [
        {
          datetime: now / 1000,
          headline: "Headline",
          source: "Publisher",
          url: "https://publisher.test",
        },
      ],
      "finnhub",
      "general",
      now,
    ),
  );
  assert.throws(() =>
    normaliseCalendar(
      [
        {
          Date: "2026-11-02T00:00:00",
          Country: "US",
          Event: "Report",
          Importance: 3,
        },
      ],
      "tradingeconomics",
    ),
  );
});

import { feedConfig } from "../lib/feeds/config";
test("independent provider budgets are conservative and reject unsupported limits", () => {
  const config = feedConfig({ MARKET_REQUESTS_PER_MINUTE: "120" });
  assert.equal(config.budgets.binance, 120);
  assert.equal(config.budgets.coingecko, 5);
  assert.equal(config.budgets.twelvedata, 8);
  assert.throws(() =>
    feedConfig({ MARKET_PROVIDER_BUDGETS: '{"twelvedata":0}' }),
  );
  assert.throws(() =>
    feedConfig({ MARKET_PROVIDER_BUDGETS: '{"unknown":20}' }),
  );
  assert.equal(config.allowed("coinbase", "ai"), false);
});
