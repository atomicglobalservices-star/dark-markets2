import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CentralSchedule,
  marketSessionAllowed,
} from "../lib/feeds/central-schedule";
import { intervals } from "../lib/jobs";
import { capitalWire, financeCalendar } from "../lib/free-content";
import {
  parseCompanyFacts,
  parseSubmissions,
  periodKind,
  secCompanies,
} from "../lib/sec-data";
import { SecClient } from "../lib/sec";
import { sessionAllows } from "../lib/market-hours";
import { resolveInstrument } from "../lib/feeds/types";
import {
  embeddedInstruments,
  embedDefinition,
  embeddedSelection,
  embeddedQuoteGroups,
} from "../lib/embedded-markets";
const now = Date.parse("2026-11-02T15:00:00Z");
test("content and fundamentals are hourly; REST price scheduling remains one minute", () => {
  assert.equal(intervals.market, 60000);
  assert.equal(intervals.news, 3600000);
  assert.equal(intervals.calendar, 3600000);
  assert.equal(intervals.fundamentals, 3600000);
});
test("hundreds of cache readers never trigger central upstream collection", async () => {
  let calls = 0,
    time = now;
  const cache = new CentralSchedule<number>(() => time);
  for (let i = 0; i < 500; i++) assert.equal(cache.read("quotes"), null);
  assert.equal(calls, 0);
  await Promise.all(
    Array.from({ length: 100 }, () =>
      cache.collect("quotes", 60000, async () => {
        calls++;
        return 42;
      }),
    ),
  );
  assert.equal(calls, 1);
  for (let i = 0; i < 1000; i++) assert.equal(cache.read("quotes")?.value, 42);
  assert.equal(calls, 1);
  time += 59999;
  await cache.collect("quotes", 60000, async () => ++calls);
  assert.equal(calls, 1);
  time += 1;
  await cache.collect("quotes", 60000, async () => ++calls);
  assert.equal(calls, 2);
});
test("central checkpoint restore retains timestamp and avoids a restart download", async () => {
  let calls = 0;
  const first = new CentralSchedule<number>(() => now);
  await first.collect("history", 3600000, async () => 5);
  const restored = new CentralSchedule<number>(() => now + 1000);
  restored.restore(JSON.parse(JSON.stringify(first.entries())));
  await restored.collect("history", 3600000, async () => ++calls);
  assert.equal(calls, 0);
  assert.equal(restored.read("history")?.at, now);
});
test("failed collection retains previous data and backs off instead of retrying per reader", async () => {
  let time = now,
    calls = 0;
  const cache = new CentralSchedule<number>(() => time);
  await cache.collect("key", 1, async () => 10);
  time++;
  await cache.collect("key", 1, async () => {
    calls++;
    throw new Error("outage");
  });
  assert.equal(cache.read("key")?.value, 10);
  for (let i = 0; i < 100; i++)
    await cache.collect("key", 1, async () => ++calls);
  assert.equal(calls, 1);
  assert.equal(cache.stats.failed, 1);
});
test("exchange session gating respects local timezone, weekends, closures and unknown venues", () => {
  const a = resolveInstrument("AAPL");
  const row = {
    exchange: "nyse",
    tz: "America/New_York",
    local_time: "2026-11-02T10:00:00-05:00",
    collectedAt: new Date(now).toISOString(),
    session: { open: "09:30", close: "16:00" },
    holiday_today: null,
  };
  assert.equal(sessionAllows(a, [row], now), true);
  assert.equal(
    sessionAllows(a, [row], Date.parse("2026-11-02T22:00:00Z")),
    false,
  );
  assert.equal(
    sessionAllows(a, [{ ...row, holiday_today: "Holiday" }], now),
    false,
  );
  assert.equal(sessionAllows(a, [], now), false);
  assert.equal(sessionAllows(resolveInstrument("BTC"), [], now), true);
  assert.equal(marketSessionAllowed(a, "closed"), false);
  assert.equal(marketSessionAllowed(a, "post"), false);
});
test("Capital Data Wire articles remain attributed AI-source material, never verified evidence", () => {
  const [a] = capitalWire(
    {
      data: [
        {
          id: "1",
          is_demo: false,
          title: "Source headline",
          summary: "Source summary",
          url: "https://capitaldatawire.com/stories/test",
          category: "Crypto",
          published_at: "2026-11-02T10:00:00-05:00",
          license: "Free to republish with attribution",
        },
      ],
    },
    now,
  );
  assert.equal(a.publishedAt, new Date(now).toISOString());
  assert.equal(a.aiGenerated, true);
  assert.equal(a.corroborated, false);
  assert.equal(a.source, "Capital Data Wire");
  assert.equal(a.category, "Crypto");
  assert.deepEqual(a.symbols, []);
  assert.throws(() =>
    capitalWire({ data: [], meta: { demo_data: true } }, now),
  );
});
test("free calendar preserves null time/impact/values and record licence/provenance", () => {
  const [e] = financeCalendar({
    events: [
      {
        id: "1",
        date: "2026-11-02",
        country: "US",
        title: "Release",
        release_at_utc: null,
        time_utc: null,
        impact: null,
        actual: null,
        prior: 0,
        consensus: null,
        source_url: "https://agency.test",
        source_name: "Agency",
        status: "estimated",
        time_precision: "day",
        source_license: { license: "CC BY", attribution: "Agency" },
        data_stale: true,
      },
    ],
    attribution: {
      source: "financecalendar.com",
      terms: "Free use with attribution",
    },
  });
  assert.equal(e.time, null);
  assert.equal(e.impact, null);
  assert.equal(e.actual, null);
  assert.equal(e.previous, 0);
  assert.equal(e.tentative, true);
  assert.equal(e.currency, "USD");
  assert.equal(e.dataStale, true);
  assert.deepEqual(e.sourceLicense, {
    license: "CC BY",
    attribution: "Agency",
  });
});
test("cancelled and duplicate calendar records do not appear as upcoming events", () => {
  const event = {
    id: "1",
    date: "2026-11-02",
    title: "Release",
    country: "GB",
    time_utc: "12:30",
    source_url: "https://agency.test",
  };
  const data = financeCalendar({
    events: [event, event, { ...event, id: "2", status: "cancelled" }],
    attribution: { terms: "Free with attribution" },
  });
  assert.equal(data.length, 1);
});
const cik = secCompanies.AAPL,
  accession = "0000320193-26-000123";
test("SEC facts preserve taxonomy/unit/fiscal period/accession, negatives and true zero", () => {
  const raw = {
    cik: Number(cik),
    facts: {
      "us-gaap": {
        NetIncomeLoss: {
          label: "Net income",
          units: {
            USD: [
              {
                val: -20,
                start: "2026-01-01",
                end: "2026-03-31",
                form: "10-Q",
                filed: "2026-04-25",
                fy: 2026,
                fp: "Q1",
                accn: accession,
              },
            ],
          },
        },
        Assets: {
          label: "Assets",
          units: {
            USD: [
              {
                val: 0,
                end: "2026-03-31",
                form: "10-Q",
                filed: "2026-04-25",
                fy: 2026,
                fp: "Q1",
                accn: accession,
              },
            ],
          },
        },
      },
    },
  };
  const rows = parseCompanyFacts(raw, cik);
  assert.equal(rows.netIncome[0].value, -20);
  assert.equal(rows.netIncome[0].taxonomy, "us-gaap");
  assert.equal(rows.netIncome[0].unit, "USD");
  assert.equal(rows.assets[0].value, 0);
  assert.deepEqual(rows.revenue, []);
  assert.equal(periodKind(rows.netIncome[0]), "quarter");
  assert.equal(periodKind(rows.assets[0]), "instant");
  assert.ok(
    rows.assets[0].sourceUrl.startsWith(
      "https://www.sec.gov/Archives/edgar/data/320193/",
    ),
  );
});
test("SEC year-to-date values are not silently labelled quarterly", () => {
  const raw = {
    cik: Number(cik),
    facts: {
      "us-gaap": {
        NetCashProvidedByUsedInOperatingActivities: {
          units: {
            USD: [
              {
                val: 100,
                start: "2026-01-01",
                end: "2026-09-30",
                form: "10-Q",
                filed: "2026-10-25",
                fy: 2026,
                fp: "Q3",
                accn: accession,
              },
            ],
          },
        },
      },
    },
  };
  const [row] = parseCompanyFacts(raw, cik).operatingCashFlow;
  assert.match(periodKind(row), /year-to-date/);
});
test("SEC submissions reject a different company and preserve a financial filing checkpoint", () => {
  const raw = {
    cik: Number(cik),
    name: "Apple Inc.",
    tickers: ["AAPL"],
    filings: {
      recent: {
        accessionNumber: [accession],
        form: ["10-K"],
        filingDate: ["2026-10-25"],
        reportDate: ["2026-09-30"],
        primaryDocument: ["aapl-20260930.htm"],
      },
    },
  };
  assert.equal(parseSubmissions(raw, "AAPL", cik).signature, accession);
  assert.throws(() =>
    parseSubmissions({ ...raw, tickers: ["OTHER"] }, "AAPL", cik),
  );
  assert.throws(() => parseCompanyFacts({ cik: 1 }, cik));
});
test("SEC client identifies requests, honors unchanged responses and rejects invented identity", async () => {
  let headers: any;
  const client = new SecClient(
    "DARK MARKETS operator@valid.test",
    async (_url, init) => {
      headers = init?.headers;
      return new Response(null, { status: 304, headers: { ETag: "v1" } });
    },
    async () => {},
  );
  const result = await client.get("submissions/CIK0000320193.json", "v1");
  assert.equal(result.notModified, true);
  assert.equal(headers["If-None-Match"], "v1");
  assert.match(headers["User-Agent"], /operator@valid.test/);
  assert.throws(() => new SecClient("anonymous"));
  assert.throws(() => new SecClient("DARK fake@example.com"));
});
test("embedded symbols keep cash indices, ETF proxies, futures and broker CFDs separate", () => {
  assert.equal(
    new Set(embeddedInstruments.map((i) => i.symbol)).size,
    embeddedInstruments.length,
  );
  assert.equal(embedDefinition("SP:SPX")?.kind, "cash index");
  assert.equal(embedDefinition("OANDA:SPX500USD")?.kind, "broker-specific CFD");
  assert.equal(embedDefinition("COMEX:GC1!")?.kind, "continuous futures");
  assert.equal(embedDefinition("AMEX:GLD")?.kind, "etf");
  assert.equal(embedDefinition("javascript:bad"), null);
});

test("market section and search share an exact chart and quote universe", () => {
  for (const category of [
    "Forex",
    "Stocks",
    "Indices",
    "Commodities",
    "ETFs",
    "CFDs",
  ]) {
    const rows = embeddedSelection(category);
    assert.ok(rows.length >= 2, category);
    assert.ok(rows.every((i) => i.category === category));
    const groups = embeddedQuoteGroups(rows);
    assert.deepEqual(
      groups.map((g) => g.name),
      [category],
    );
    assert.deepEqual(
      groups[0].symbols.map((i) => i.name),
      rows.map((i) => i.symbol),
    );
  }
  assert.equal(embeddedSelection("CFDs", "NASDAQ:AAPL").length, 0);
  assert.equal(
    embeddedSelection("Forex", "  eurusd  ")[0].symbol,
    "FX_IDC:EURUSD",
  );
  assert.equal(embeddedSelection("Crypto").length, 8);
  assert.equal(embeddedSelection().length, 40);
  assert.equal(
    embeddedSelection("All markets", "", false).length,
    embeddedInstruments.length,
  );
});
